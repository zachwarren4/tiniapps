use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::process::Command;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

const KEYCHAIN_SERVICE: &str = "microapp-shell";
const ANTHROPIC_API_KEY_ACCOUNT: &str = "anthropic-api-key";
const OPENROUTER_API_KEY_ACCOUNT: &str = "openrouter-api-key";
const DEFAULT_LLM_PROVIDER_ACCOUNT: &str = "default-llm-provider";
const DEFAULT_ANTHROPIC_MODEL: &str = "claude-sonnet-4-6";
const DEFAULT_OPENROUTER_MODEL: &str = "anthropic/claude-sonnet-4";

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
    sources: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
struct SearchResult {
    source: String,
    title: String,
    url: String,
    snippet: String,
}

#[derive(Debug, Deserialize)]
struct GoogleSearchResponse {
    items: Option<Vec<GoogleSearchItem>>,
}

#[derive(Debug, Deserialize)]
struct GoogleSearchItem {
    title: String,
    link: String,
    snippet: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleErrorEnvelope {
    error: Option<GoogleErrorBody>,
}

#[derive(Debug, Deserialize)]
struct GoogleErrorBody {
    message: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderNote {
    source: String,
    provider: String,
    /// `error` | `warn` | `info`
    level: String,
    code: String,
    message: String,
}

#[derive(Debug, Deserialize)]
struct RedditListing {
    data: Option<RedditListingData>,
}

#[derive(Debug, Deserialize)]
struct RedditListingData {
    children: Option<Vec<RedditChild>>,
}

#[derive(Debug, Deserialize)]
struct RedditChild {
    data: Option<RedditChildData>,
}

#[derive(Debug, Deserialize)]
struct RedditChildData {
    title: Option<String>,
    permalink: Option<String>,
    selftext: Option<String>,
    url: Option<String>,
    subreddit: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WikiSearchResponse {
    query: WikiSearchQuery,
}

#[derive(Debug, Deserialize)]
struct WikiSearchQuery {
    search: Vec<WikiSearchItem>,
}

#[derive(Debug, Deserialize)]
struct WikiSearchItem {
    title: String,
    snippet: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserOpenPayload {
    url: String,
    title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReaderPreviewPayload {
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResearchGatherPayload {
    query: String,
    sources: Option<Vec<String>>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmCompletePayload {
    prompt: String,
    system: Option<String>,
    max_tokens: Option<u32>,
    model: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum LlmProvider {
    Anthropic,
    Openrouter,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveSettingsRequest {
    anthropic_api_key: Option<String>,
    openrouter_api_key: Option<String>,
    default_llm_provider: LlmProvider,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsResponse {
    anthropic_api_key_stored: bool,
    openrouter_api_key_stored: bool,
    default_llm_provider: LlmProvider,
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

#[derive(Debug, Deserialize)]
struct OpenRouterResponse {
    choices: Vec<OpenRouterChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterChoice {
    message: OpenRouterMessage,
}

#[derive(Debug, Deserialize)]
struct OpenRouterMessage {
    content: Option<String>,
}

#[tauri::command]
async fn broker_request(app: AppHandle, request: BrokerRequest) -> BrokerResponse {
    eprintln!(
        "[broker] {} requested {}",
        request.microapp_id, request.capability
    );
    match request.capability.clone().as_str() {
        "web.search" => match web_search(request.payload).await {
            Ok(data) => BrokerResponse::ok(request.microapp_id, request.capability, data),
            Err(error) => {
                eprintln!("[broker] web.search failed: {error}");
                BrokerResponse::err(
                    request.microapp_id,
                    request.capability,
                    "web_search_failed",
                    error,
                )
            }
        },
        "llm.complete" => match llm_complete(request.payload).await {
            Ok(data) => BrokerResponse::ok(request.microapp_id, request.capability, data),
            Err(error) => {
                eprintln!("[broker] llm.complete failed: {error}");
                BrokerResponse::err(
                    request.microapp_id,
                    request.capability,
                    "llm_complete_failed",
                    error,
                )
            }
        },
        "browser.open" => match browser_open(&app, &request.microapp_id, request.payload).await {
            Ok(data) => BrokerResponse::ok(request.microapp_id, request.capability, data),
            Err(error) => {
                eprintln!("[broker] browser.open failed: {error}");
                BrokerResponse::err(
                    request.microapp_id,
                    request.capability,
                    "browser_open_failed",
                    error,
                )
            }
        },
        "reader.preview" => match reader_preview(request.payload).await {
            Ok(data) => BrokerResponse::ok(request.microapp_id, request.capability, data),
            Err(error) => {
                eprintln!("[broker] reader.preview failed: {error}");
                BrokerResponse::err(
                    request.microapp_id,
                    request.capability,
                    "reader_preview_failed",
                    error,
                )
            }
        },
        "research.gather" => match research_gather(request.payload).await {
            Ok(data) => BrokerResponse::ok(request.microapp_id, request.capability, data),
            Err(error) => {
                eprintln!("[broker] research.gather failed: {error}");
                BrokerResponse::err(
                    request.microapp_id,
                    request.capability,
                    "research_gather_failed",
                    error,
                )
            }
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

#[tauri::command]
fn get_settings() -> SettingsResponse {
    SettingsResponse {
        anthropic_api_key_stored: credential_is_available(
            ANTHROPIC_API_KEY_ACCOUNT,
            "ANTHROPIC_API_KEY",
        ),
        openrouter_api_key_stored: credential_is_available(
            OPENROUTER_API_KEY_ACCOUNT,
            "OPENROUTER_API_KEY",
        ),
        default_llm_provider: read_default_llm_provider(),
    }
}

#[tauri::command]
fn save_settings(settings: SaveSettingsRequest) -> Result<SettingsResponse, String> {
    if let Some(secret) = settings
        .anthropic_api_key
        .as_deref()
        .map(str::trim)
        .filter(|secret| !secret.is_empty())
    {
        write_keychain_secret(ANTHROPIC_API_KEY_ACCOUNT, secret)?;
    }

    if let Some(secret) = settings
        .openrouter_api_key
        .as_deref()
        .map(str::trim)
        .filter(|secret| !secret.is_empty())
    {
        write_keychain_secret(OPENROUTER_API_KEY_ACCOUNT, secret)?;
    }

    write_keychain_secret(
        DEFAULT_LLM_PROVIDER_ACCOUNT,
        settings.default_llm_provider.as_str(),
    )?;

    Ok(get_settings())
}

async fn web_search(payload: Value) -> Result<Value, String> {
    let payload: WebSearchPayload =
        serde_json::from_value(payload).map_err(|error| error.to_string())?;
    let limit = payload.limit.unwrap_or(5).clamp(1, 10);
    let sources = normalize_sources(payload.sources);
    let client = reqwest::Client::new();
    let mut results = Vec::new();
    let mut notes: Vec<ProviderNote> = Vec::new();

    for source in &sources {
        let (mut source_results, mut source_notes) =
            search_one_source(&client, source, &payload.query, limit).await;
        eprintln!(
            "[broker] web.search {source}: {} results, {} notes",
            source_results.len(),
            source_notes.len()
        );
        results.append(&mut source_results);
        notes.append(&mut source_notes);
    }

    Ok(json!({
        "query": payload.query,
        "sources": sources,
        "results": results,
        "notes": notes,
    }))
}

async fn search_one_source(
    client: &reqwest::Client,
    source: &str,
    raw_query: &str,
    limit: usize,
) -> (Vec<SearchResult>, Vec<ProviderNote>) {
    let scoped_query = source_query(source, raw_query);
    let mut notes: Vec<ProviderNote> = Vec::new();

    let (mut results, google_note) =
        google_custom_search(client, source, &scoped_query, limit).await;
    if let Some(note) = google_note {
        notes.push(note);
    }

    // Source-specific JSON fallbacks. We deliberately do NOT scrape HTML here:
    // every fallback either returns structured JSON or reports a note. If a source
    // has no keyless JSON fallback, an empty result is fine and the Google note
    // above is what the UI shows to explain why.
    if results.is_empty() {
        match source {
            "wiki" => {
                let (wiki_results, wiki_note) = wiki_search(client, raw_query, limit).await;
                results = wiki_results;
                if let Some(note) = wiki_note {
                    notes.push(note);
                }
            }
            "reddit" => {
                let (reddit_results, reddit_note) =
                    reddit_json_search(client, raw_query, limit).await;
                results = reddit_results;
                if let Some(note) = reddit_note {
                    notes.push(note);
                }
            }
            _ => {}
        }
    }

    (results, notes)
}

async fn research_gather(payload: Value) -> Result<Value, String> {
    let payload: ResearchGatherPayload =
        serde_json::from_value(payload).map_err(|error| error.to_string())?;
    let raw_query = payload.query.trim().to_string();
    if raw_query.is_empty() {
        return Err("Research query is empty".to_string());
    }

    let limit = payload.limit.unwrap_or(3).clamp(1, 6);
    let sources = normalize_sources(payload.sources);
    let client = reqwest::Client::new();

    let mut expanded_queries = Vec::with_capacity(sources.len());
    let mut all_results: Vec<SearchResult> = Vec::new();
    let mut notes: Vec<ProviderNote> = Vec::new();

    for source in &sources {
        expanded_queries.push(json!({
            "source": source,
            "query": source_query(source, &raw_query),
        }));
        let (mut source_results, mut source_notes) =
            search_one_source(&client, source, &raw_query, limit).await;
        eprintln!(
            "[broker] research.gather {source}: {} results, {} notes",
            source_results.len(),
            source_notes.len()
        );
        all_results.append(&mut source_results);
        notes.append(&mut source_notes);
    }

    // Deduplicate by normalized URL while preserving order; the first hit per URL wins.
    let mut seen_urls: HashSet<String> = HashSet::new();
    let unique: Vec<SearchResult> = all_results
        .into_iter()
        .filter(|result| seen_urls.insert(normalize_corpus_url(&result.url)))
        .collect();

    // Cap preview fetches so a wide source mix does not balloon into many HTML scrapes.
    let preview_per_source: usize = 2;
    let mut preview_counts: HashMap<String, usize> = HashMap::new();
    let mut corpus = Vec::with_capacity(unique.len());

    for result in unique {
        let used = preview_counts.entry(result.source.clone()).or_insert(0);
        let preview = if *used < preview_per_source {
            *used += 1;
            match preview_content_for_url(&client, &result.url).await {
                Ok(content) if !content.is_empty() => Some(content),
                Ok(_) => None,
                Err(error) => {
                    eprintln!(
                        "[broker] research.gather preview failed for {}: {error}",
                        result.url
                    );
                    None
                }
            }
        } else {
            None
        };

        let mut entry = json!({
            "source": result.source,
            "title": result.title,
            "url": result.url,
            "snippet": result.snippet,
        });
        if let Some(preview) = preview {
            entry["preview"] = json!(preview);
        }
        corpus.push(entry);
    }

    Ok(json!({
        "query": raw_query,
        "expandedQueries": expanded_queries,
        "corpus": corpus,
        "notes": notes,
    }))
}

async fn preview_content_for_url(
    client: &reqwest::Client,
    url: &str,
) -> Result<Vec<String>, String> {
    let preview = reader_preview_for_url(client, url).await?;
    let content = preview
        .get("content")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|text| text.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(content)
}

fn normalize_corpus_url(raw: &str) -> String {
    match Url::parse(raw) {
        Ok(mut url) => {
            url.set_fragment(None);
            url.to_string()
        }
        Err(_) => raw.to_string(),
    }
}

async fn google_custom_search(
    client: &reqwest::Client,
    source: &str,
    query: &str,
    limit: usize,
) -> (Vec<SearchResult>, Option<ProviderNote>) {
    let api_key = read_optional_secret("google-search-api-key", "GOOGLE_SEARCH_API_KEY");
    let search_engine_id = read_optional_secret(
        &format!("google-search-engine-id-{source}"),
        &format!("GOOGLE_SEARCH_ENGINE_ID_{}", source.to_ascii_uppercase()),
    )
    .or_else(|| read_optional_secret("google-search-engine-id", "GOOGLE_SEARCH_ENGINE_ID"));

    let (api_key, search_engine_id) = match (api_key, search_engine_id) {
        (Some(api_key), Some(cx)) => (api_key, cx),
        _ => {
            return (
                Vec::new(),
                Some(ProviderNote {
                    source: source.to_string(),
                    provider: "google_cse".to_string(),
                    level: "info".to_string(),
                    code: "no_credentials".to_string(),
                    message: format!(
                        "No Google Custom Search credentials for {source}. Store `google-search-api-key` and `google-search-engine-id` (optionally `google-search-engine-id-{source}`) in the shell keychain to enable JSON search.",
                    ),
                }),
            );
        }
    };

    let url = format!(
        "https://www.googleapis.com/customsearch/v1?key={}&cx={}&q={}&num={}",
        urlencoding::encode(&api_key),
        urlencoding::encode(&search_engine_id),
        urlencoding::encode(query),
        limit.clamp(1, 10),
    );
    let response = match client
        .get(url)
        .header("user-agent", "microapp-shell/0.1")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return (
                Vec::new(),
                Some(ProviderNote {
                    source: source.to_string(),
                    provider: "google_cse".to_string(),
                    level: "error".to_string(),
                    code: "network_error".to_string(),
                    message: error.to_string(),
                }),
            );
        }
    };

    let status = response.status();
    if !status.is_success() {
        // Capture the JSON error body so the microapp can show Google's actual
        // reason (e.g. "PERMISSION_DENIED: Custom Search JSON API not enabled").
        let body_text = response.text().await.unwrap_or_default();
        let parsed_message = serde_json::from_str::<GoogleErrorEnvelope>(&body_text)
            .ok()
            .and_then(|envelope| envelope.error)
            .and_then(|error| {
                let status_part = error
                    .status
                    .map(|status| format!("{status}: "))
                    .unwrap_or_default();
                error
                    .message
                    .map(|message| format!("{status_part}{message}"))
            })
            .unwrap_or_else(|| {
                let trimmed = body_text.trim();
                if trimmed.is_empty() {
                    format!("HTTP {status}")
                } else {
                    format!("HTTP {status}: {trimmed}")
                }
            });
        let code = format!("http_{}", status.as_u16());
        eprintln!("[broker] google custom search unavailable for {source}: {parsed_message}");
        return (
            Vec::new(),
            Some(ProviderNote {
                source: source.to_string(),
                provider: "google_cse".to_string(),
                level: "error".to_string(),
                code,
                message: parsed_message,
            }),
        );
    }

    let response: GoogleSearchResponse = match response.json().await {
        Ok(response) => response,
        Err(error) => {
            return (
                Vec::new(),
                Some(ProviderNote {
                    source: source.to_string(),
                    provider: "google_cse".to_string(),
                    level: "error".to_string(),
                    code: "parse_error".to_string(),
                    message: error.to_string(),
                }),
            );
        }
    };

    let results: Vec<SearchResult> = response
        .items
        .unwrap_or_default()
        .into_iter()
        .filter(|item| !item.title.is_empty() && !item.link.is_empty())
        .map(|item| SearchResult {
            source: source.to_string(),
            title: item.title,
            url: item.link,
            snippet: item.snippet.unwrap_or_default(),
        })
        .collect();

    let note = if results.is_empty() {
        Some(ProviderNote {
            source: source.to_string(),
            provider: "google_cse".to_string(),
            level: "warn".to_string(),
            code: "no_results".to_string(),
            message: format!("Google CSE returned 0 items for `{query}`."),
        })
    } else {
        None
    };

    (results, note)
}

async fn reddit_json_search(
    client: &reqwest::Client,
    raw_query: &str,
    limit: usize,
) -> (Vec<SearchResult>, Option<ProviderNote>) {
    // Reddit's public search JSON endpoint. The `subreddit:` and `nsfw:no`
    // filters live inside the `q` parameter; no auth needed for read.
    let q = format!(
        "(subreddit:tearsofthekingdom OR subreddit:zelda) Tears of the Kingdom {raw_query}"
    );
    let url = format!(
        "https://www.reddit.com/search.json?q={}&sort=relevance&limit={}&type=link&include_over_18=off",
        urlencoding::encode(&q),
        limit.clamp(1, 10),
    );

    let response = match client
        .get(url)
        // Reddit blocks requests with default reqwest UA; needs a descriptive one.
        .header("user-agent", "microapp-shell/0.1 (totk research)")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return (
                Vec::new(),
                Some(ProviderNote {
                    source: "reddit".to_string(),
                    provider: "reddit_json".to_string(),
                    level: "error".to_string(),
                    code: "network_error".to_string(),
                    message: error.to_string(),
                }),
            );
        }
    };

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let trimmed: String = body.chars().take(200).collect();
        return (
            Vec::new(),
            Some(ProviderNote {
                source: "reddit".to_string(),
                provider: "reddit_json".to_string(),
                level: "error".to_string(),
                code: format!("http_{}", status.as_u16()),
                message: if trimmed.is_empty() {
                    format!("HTTP {status}")
                } else {
                    format!("HTTP {status}: {trimmed}")
                },
            }),
        );
    }

    let listing: RedditListing = match response.json().await {
        Ok(listing) => listing,
        Err(error) => {
            return (
                Vec::new(),
                Some(ProviderNote {
                    source: "reddit".to_string(),
                    provider: "reddit_json".to_string(),
                    level: "error".to_string(),
                    code: "parse_error".to_string(),
                    message: error.to_string(),
                }),
            );
        }
    };

    let children = listing
        .data
        .and_then(|data| data.children)
        .unwrap_or_default();

    let results: Vec<SearchResult> = children
        .into_iter()
        .filter_map(|child| {
            let data = child.data?;
            let title = data.title.unwrap_or_default();
            let permalink = data.permalink.unwrap_or_default();
            if title.is_empty() || permalink.is_empty() {
                return None;
            }
            let url = if let Some(direct) = data.url.as_deref().filter(|value| {
                value.starts_with("https://www.reddit.com")
                    || value.starts_with("https://old.reddit.com")
            }) {
                direct.to_string()
            } else {
                format!("https://www.reddit.com{permalink}")
            };
            let snippet_source = data.selftext.unwrap_or_default();
            let snippet = if snippet_source.is_empty() {
                data.subreddit
                    .map(|name| format!("r/{name}"))
                    .unwrap_or_default()
            } else {
                truncate_chars(&snippet_source, 280)
            };
            Some(SearchResult {
                source: "reddit".to_string(),
                title,
                url,
                snippet,
            })
        })
        .take(limit)
        .collect();

    let note = if results.is_empty() {
        Some(ProviderNote {
            source: "reddit".to_string(),
            provider: "reddit_json".to_string(),
            level: "warn".to_string(),
            code: "no_results".to_string(),
            message: "Reddit JSON search returned 0 posts.".to_string(),
        })
    } else {
        None
    };

    (results, note)
}

async fn wiki_search(
    client: &reqwest::Client,
    query: &str,
    limit: usize,
) -> (Vec<SearchResult>, Option<ProviderNote>) {
    let url = format!(
        "https://zeldawiki.wiki/w/api.php?action=query&list=search&format=json&srlimit={}&srsearch={}",
        limit,
        urlencoding::encode(query)
    );
    let response = match client
        .get(url)
        .header("user-agent", "microapp-shell/0.1")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return (
                Vec::new(),
                Some(ProviderNote {
                    source: "wiki".to_string(),
                    provider: "zelda_wiki".to_string(),
                    level: "error".to_string(),
                    code: "network_error".to_string(),
                    message: error.to_string(),
                }),
            );
        }
    };

    let body: WikiSearchResponse = match response.json().await {
        Ok(body) => body,
        Err(error) => {
            return (
                Vec::new(),
                Some(ProviderNote {
                    source: "wiki".to_string(),
                    provider: "zelda_wiki".to_string(),
                    level: "error".to_string(),
                    code: "parse_error".to_string(),
                    message: error.to_string(),
                }),
            );
        }
    };

    let results: Vec<SearchResult> = body
        .query
        .search
        .into_iter()
        .map(|item| {
            let encoded_title = item.title.replace(' ', "_");
            SearchResult {
                source: "wiki".to_string(),
                title: item.title,
                url: format!("https://zeldawiki.wiki/wiki/{encoded_title}"),
                snippet: html_fragment_text(&item.snippet),
            }
        })
        .collect();

    let note = if results.is_empty() {
        Some(ProviderNote {
            source: "wiki".to_string(),
            provider: "zelda_wiki".to_string(),
            level: "warn".to_string(),
            code: "no_results".to_string(),
            message: format!(
                "Zelda wiki keyword search returned 0 hits for `{query}`. Try a shorter noun phrase, or enable Google CSE for source-scoped wiki results.",
            ),
        })
    } else {
        None
    };

    (results, note)
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    let mut iter = text.chars();
    let truncated: String = iter.by_ref().take(max_chars).collect();
    if iter.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

fn normalize_sources(sources: Option<Vec<String>>) -> Vec<String> {
    let mut normalized: Vec<String> = sources
        .unwrap_or_else(|| vec!["web".to_string()])
        .into_iter()
        .filter_map(|source| match source.as_str() {
            "web" | "youtube" | "reddit" | "wiki" => Some(source),
            _ => None,
        })
        .collect();

    if normalized.is_empty() {
        normalized.push("web".to_string());
    }

    normalized.sort();
    normalized.dedup();
    normalized
}

fn source_query(source: &str, query: &str) -> String {
    match source {
        "youtube" => format!("site:youtube.com Tears of the Kingdom {query}"),
        "reddit" => format!(
            "(site:reddit.com/r/tearsofthekingdom OR site:reddit.com/r/zelda) Tears of the Kingdom {query}"
        ),
        "wiki" => format!(
            "(site:zeldawiki.wiki OR site:zelda.fandom.com) {query} Tears of the Kingdom"
        ),
        _ => format!("Tears of the Kingdom {query}"),
    }
}

fn normalize_text(text: String) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn html_fragment_text(fragment: &str) -> String {
    let document = Html::parse_fragment(fragment);
    normalize_text(document.root_element().text().collect::<Vec<_>>().join(" "))
}

async fn llm_complete(payload: Value) -> Result<Value, String> {
    let payload: LlmCompletePayload =
        serde_json::from_value(payload).map_err(|error| error.to_string())?;
    match read_default_llm_provider() {
        LlmProvider::Anthropic => anthropic_complete(payload).await,
        LlmProvider::Openrouter => openrouter_complete(payload).await,
    }
}

async fn anthropic_complete(payload: LlmCompletePayload) -> Result<Value, String> {
    let api_key = read_required_secret(ANTHROPIC_API_KEY_ACCOUNT, "ANTHROPIC_API_KEY")?;
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
        "provider": LlmProvider::Anthropic,
        "model": model,
        "text": text,
    }))
}

async fn openrouter_complete(payload: LlmCompletePayload) -> Result<Value, String> {
    let api_key = read_required_secret(OPENROUTER_API_KEY_ACCOUNT, "OPENROUTER_API_KEY")?;
    let model = payload
        .model
        .or_else(|| std::env::var("OPENROUTER_MODEL").ok())
        .unwrap_or_else(|| DEFAULT_OPENROUTER_MODEL.to_string());

    let mut messages = Vec::new();
    if let Some(system) = payload.system {
        messages.push(json!({ "role": "system", "content": system }));
    }
    messages.push(json!({ "role": "user", "content": payload.prompt }));

    let body = json!({
        "model": model,
        "max_tokens": payload.max_tokens.unwrap_or(700).clamp(1, 4000),
        "messages": messages,
    });

    let response: OpenRouterResponse = reqwest::Client::new()
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("authorization", format!("Bearer {api_key}"))
        .header("content-type", "application/json")
        .header("http-referer", "https://tiniapps.local")
        .header("x-title", "tiniapps")
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
        .choices
        .into_iter()
        .filter_map(|choice| choice.message.content)
        .collect::<Vec<_>>()
        .join("\n\n");

    Ok(json!({
        "provider": LlmProvider::Openrouter,
        "model": model,
        "text": text,
    }))
}

async fn browser_open(app: &AppHandle, microapp_id: &str, payload: Value) -> Result<Value, String> {
    let payload: BrowserOpenPayload =
        serde_json::from_value(payload).map_err(|error| error.to_string())?;
    let url = Url::parse(&payload.url).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only http and https URLs can be opened in a microapp browser".to_string());
    }

    let label = browser_window_label(microapp_id, url.as_str());
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(json!({
            "windowLabel": label,
            "url": url.as_str(),
            "focusedExisting": true,
        }));
    }

    let title = payload
        .title
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| url.host_str().unwrap_or("Result").to_string());
    let window_title = format!("TOTK - {title}");

    WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url.clone()))
        .title(window_title)
        .inner_size(1100.0, 760.0)
        .min_inner_size(720.0, 480.0)
        .focused(true)
        .build()
        .map_err(|error| error.to_string())?;

    Ok(json!({
        "windowLabel": label,
        "url": url.as_str(),
        "focusedExisting": false,
    }))
}

async fn reader_preview(payload: Value) -> Result<Value, String> {
    let payload: ReaderPreviewPayload =
        serde_json::from_value(payload).map_err(|error| error.to_string())?;
    let client = reqwest::Client::new();
    reader_preview_for_url(&client, &payload.url).await
}

async fn reader_preview_for_url(client: &reqwest::Client, raw_url: &str) -> Result<Value, String> {
    let url = Url::parse(raw_url).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only http and https URLs can be previewed".to_string());
    }

    if url.domain() == Some("zeldawiki.wiki") && url.path().starts_with("/wiki/") {
        if let Ok(preview) = wiki_article_preview(client, &url).await {
            return Ok(preview);
        }
    }

    html_reader_preview(client, url).await
}

async fn wiki_article_preview(client: &reqwest::Client, url: &Url) -> Result<Value, String> {
    let raw_title = url
        .path()
        .trim_start_matches("/wiki/")
        .split('/')
        .next()
        .unwrap_or_default();
    let title = urlencoding::decode(raw_title)
        .map_err(|error| error.to_string())?
        .replace('_', " ");
    if title.is_empty() {
        return Err("Missing wiki article title".to_string());
    }

    let api_url = format!(
        "https://zeldawiki.wiki/w/api.php?action=query&prop=extracts&explaintext=1&exintro=1&redirects=1&format=json&titles={}",
        urlencoding::encode(&title)
    );
    let response: Value = client
        .get(api_url)
        .header("user-agent", "microapp-shell/0.1")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;

    let page = response
        .get("query")
        .and_then(|query| query.get("pages"))
        .and_then(|pages| pages.as_object())
        .and_then(|pages| pages.values().next())
        .ok_or_else(|| "Wiki page not found".to_string())?;
    let resolved_title = page
        .get("title")
        .and_then(|value| value.as_str())
        .unwrap_or(&title);
    let extract = page
        .get("extract")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let paragraphs = extract
        .split('\n')
        .map(|text| normalize_text(text.to_string()))
        .filter(|text| !text.is_empty())
        .take(8)
        .collect::<Vec<_>>();

    if paragraphs.is_empty() {
        return Err("Wiki page did not include a readable extract".to_string());
    }

    Ok(json!({
        "title": resolved_title,
        "url": url.as_str(),
        "source": "wiki",
        "content": paragraphs,
    }))
}

async fn html_reader_preview(client: &reqwest::Client, url: Url) -> Result<Value, String> {
    let html = client
        .get(url.clone())
        .header("user-agent", "microapp-shell/0.1")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;
    let document = Html::parse_document(&html);
    let title_selector = Selector::parse("title").map_err(|error| error.to_string())?;
    let meta_selector =
        Selector::parse(r#"meta[name="description"]"#).map_err(|error| error.to_string())?;
    let content_selector = Selector::parse("article p, main p, p, article li, main li")
        .map_err(|error| error.to_string())?;
    let title = document
        .select(&title_selector)
        .next()
        .map(|node| normalize_text(node.text().collect::<Vec<_>>().join(" ")))
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| url.host_str().unwrap_or("Preview").to_string());
    let meta_description = document
        .select(&meta_selector)
        .next()
        .and_then(|node| node.value().attr("content"))
        .map(|text| normalize_text(text.to_string()));

    let mut content = Vec::new();
    if let Some(description) = meta_description {
        if !description.is_empty() {
            content.push(description);
        }
    }
    for text in document
        .select(&content_selector)
        .map(|node| normalize_text(node.text().collect::<Vec<_>>().join(" ")))
        .filter(|text| text.len() > 40)
    {
        if !content.contains(&text) {
            content.push(text);
        }
        if content.len() >= 8 {
            break;
        }
    }

    Ok(json!({
        "title": title,
        "url": url.as_str(),
        "source": url.host_str().unwrap_or("web"),
        "content": content,
    }))
}

fn browser_window_label(microapp_id: &str, url: &str) -> String {
    let mut hasher = DefaultHasher::new();
    microapp_id.hash(&mut hasher);
    url.hash(&mut hasher);
    format!("microapp-{microapp_id}-result-{:x}", hasher.finish())
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect()
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

fn read_optional_secret(account: &str, env_var: &str) -> Option<String> {
    read_keychain_secret(account)
        .ok()
        .or_else(|| std::env::var(env_var).ok())
        .filter(|value| !value.trim().is_empty())
}

fn read_required_secret(account: &str, env_var: &str) -> Result<String, String> {
    read_optional_secret(account, env_var)
        .ok_or_else(|| format!("Missing credential `{account}`. Save it in Settings."))
}

fn credential_is_available(account: &str, env_var: &str) -> bool {
    read_optional_secret(account, env_var).is_some()
}

fn read_default_llm_provider() -> LlmProvider {
    read_optional_secret(DEFAULT_LLM_PROVIDER_ACCOUNT, "DEFAULT_LLM_PROVIDER")
        .and_then(|value| LlmProvider::parse(&value))
        .unwrap_or(LlmProvider::Anthropic)
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
            credential_status,
            get_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running Microapp Shell");
}

impl LlmProvider {
    fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "anthropic" => Some(Self::Anthropic),
            "openrouter" => Some(Self::Openrouter),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::Openrouter => "openrouter",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llm_provider_parse_supports_brokered_providers() {
        assert_eq!(
            LlmProvider::parse("anthropic"),
            Some(LlmProvider::Anthropic)
        );
        assert_eq!(
            LlmProvider::parse("OpenRouter"),
            Some(LlmProvider::Openrouter)
        );
        assert_eq!(LlmProvider::parse(" unknown "), None);
    }
}
