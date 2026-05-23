use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::process::Command;

const KEYCHAIN_SERVICE: &str = "microapp-shell";
const DEFAULT_ANTHROPIC_MODEL: &str = "claude-sonnet-4-6";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerRequest {
    microapp_id: String,
    capability: String,
    payload: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerResponse {
    ok: bool,
    microapp_id: String,
    capability: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<BrokerError>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerError {
    code: String,
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebSearchPayload {
    query: String,
    limit: Option<usize>,
}

#[derive(Debug, Serialize)]
struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmCompletePayload {
    prompt: String,
    system: Option<String>,
    max_tokens: Option<u32>,
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
}

#[tauri::command]
async fn broker_request(request: BrokerRequest) -> BrokerResponse {
    match request.capability.clone().as_str() {
        "web.search" => match web_search(request.payload).await {
            Ok(data) => BrokerResponse::ok(request.microapp_id, request.capability, data),
            Err(error) => BrokerResponse::err(
                request.microapp_id,
                request.capability,
                "web_search_failed",
                error,
            ),
        },
        "llm.complete" => match llm_complete(request.payload).await {
            Ok(data) => BrokerResponse::ok(request.microapp_id, request.capability, data),
            Err(error) => BrokerResponse::err(
                request.microapp_id,
                request.capability,
                "llm_complete_failed",
                error,
            ),
        },
        other => BrokerResponse::err(
            request.microapp_id,
            request.capability,
            "unknown_capability",
            format!("Unsupported capability: {other}"),
        ),
    }
}

#[tauri::command]
fn save_credential(account: String, secret: String) -> Result<(), String> {
    write_keychain_secret(&account, &secret)
}

#[tauri::command]
fn credential_status(account: String) -> bool {
    read_keychain_secret(&account).is_ok()
}

async fn web_search(payload: Value) -> Result<Value, String> {
    let payload: WebSearchPayload =
        serde_json::from_value(payload).map_err(|error| error.to_string())?;
    let limit = payload.limit.unwrap_or(5).clamp(1, 10);
    let url = format!(
        "https://duckduckgo.com/html/?q={}",
        urlencoding::encode(&payload.query)
    );

    let html = reqwest::Client::new()
        .get(url)
        .header("user-agent", "microapp-shell/0.1")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;

    let document = Html::parse_document(&html);
    let result_selector = Selector::parse(".result").map_err(|error| error.to_string())?;
    let title_selector = Selector::parse(".result__a").map_err(|error| error.to_string())?;
    let snippet_selector =
        Selector::parse(".result__snippet").map_err(|error| error.to_string())?;

    let results: Vec<SearchResult> = document
        .select(&result_selector)
        .filter_map(|result| {
            let title_node = result.select(&title_selector).next()?;
            let title = title_node
                .text()
                .collect::<Vec<_>>()
                .join(" ")
                .trim()
                .to_string();
            let url = title_node.value().attr("href")?.to_string();
            let snippet = result
                .select(&snippet_selector)
                .next()
                .map(|node| node.text().collect::<Vec<_>>().join(" ").trim().to_string())
                .unwrap_or_default();

            if title.is_empty() || url.is_empty() {
                None
            } else {
                Some(SearchResult {
                    title,
                    url,
                    snippet,
                })
            }
        })
        .take(limit)
        .collect();

    Ok(json!({
        "query": payload.query,
        "results": results,
    }))
}

async fn llm_complete(payload: Value) -> Result<Value, String> {
    let payload: LlmCompletePayload =
        serde_json::from_value(payload).map_err(|error| error.to_string())?;
    let api_key = read_keychain_secret("anthropic-api-key")
        .or_else(|_| std::env::var("ANTHROPIC_API_KEY").map_err(|error| error.to_string()))?;
    let model = payload
        .model
        .or_else(|| std::env::var("ANTHROPIC_MODEL").ok())
        .unwrap_or_else(|| DEFAULT_ANTHROPIC_MODEL.to_string());

    let mut body = json!({
        "model": model,
        "max_tokens": payload.max_tokens.unwrap_or(700).clamp(1, 4000),
        "messages": [
            { "role": "user", "content": payload.prompt }
        ]
    });

    if let Some(system) = payload.system {
        body["system"] = json!(system);
    }

    let response: AnthropicResponse = reqwest::Client::new()
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;

    let text = response
        .content
        .into_iter()
        .filter(|block| block.kind == "text")
        .filter_map(|block| block.text)
        .collect::<Vec<_>>()
        .join("\n\n");

    Ok(json!({
        "model": model,
        "text": text,
    }))
}

impl BrokerResponse {
    fn ok(microapp_id: String, capability: String, data: Value) -> Self {
        Self {
            ok: true,
            microapp_id,
            capability,
            data: Some(data),
            error: None,
        }
    }

    fn err(microapp_id: String, capability: String, code: &str, message: String) -> Self {
        Self {
            ok: false,
            microapp_id,
            capability,
            data: None,
            error: Some(BrokerError {
                code: code.to_string(),
                message,
            }),
        }
    }
}

fn read_keychain_secret(account: &str) -> Result<String, String> {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            account,
            "-w",
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        String::from_utf8(output.stdout)
            .map(|value| value.trim_end().to_string())
            .map_err(|error| error.to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn write_keychain_secret(account: &str, secret: &str) -> Result<(), String> {
    let status = Command::new("security")
        .args([
            "add-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            account,
            "-w",
            secret,
            "-U",
        ])
        .status()
        .map_err(|error| error.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("security exited with status {status}"))
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            broker_request,
            save_credential,
            credential_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running Microapp Shell");
}
