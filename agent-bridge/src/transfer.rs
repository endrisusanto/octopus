use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::{mpsc::Sender, watch, Mutex};
use crate::protocol::OutgoingMessage;
use futures_util::StreamExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransferSignal {
    Running,
    Pause,
    Cancel,
}

static ACTIVE_TRANSFERS: OnceLock<Mutex<HashMap<String, watch::Sender<TransferSignal>>>> = OnceLock::new();

fn get_active_transfers() -> &'static Mutex<HashMap<String, watch::Sender<TransferSignal>>> {
    ACTIVE_TRANSFERS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn get_target_firmware_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("OCTOPUS_FIRMWARE_DIR") {
        PathBuf::from(custom)
    } else if cfg!(target_os = "windows") {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            PathBuf::from(profile).join("Downloads").join("OctopusFirmware")
        } else {
            PathBuf::from(r"C:\Octopus\firmware")
        }
    } else {
        if let Ok(home) = std::env::var("HOME") {
            PathBuf::from(home).join(".octopus").join("firmware")
        } else {
            PathBuf::from("/opt/octopus/firmware")
        }
    }
}

// ponytail: Minimal high-speed async HTTP binary downloader & cross-node artifact replicator
pub async fn download_binary_file(
    source_pc_id: String,
    target_pc_id: String,
    filename: String,
    _path: Option<String>,
    hub_url: String,
    tx: Sender<OutgoingMessage>,
) {
    let target_dir = get_target_firmware_dir();

    if let Err(e) = tokio::fs::create_dir_all(&target_dir).await {
        let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
            source_pc_id: source_pc_id.clone(),
            target_pc_id: target_pc_id.clone(),
            filename: filename.clone(),
            progress_pct: 0,
            speed_mb: None,
            downloaded_bytes: 0,
            total_bytes: 0,
            status: "failed".to_string(),
            error: Some(format!("Gagal membuat direktori tujuan: {}", e)),
        }).await;
        return;
    }

    let final_dest = target_dir.join(&filename);
    let part_dest = target_dir.join(format!("{}.part", &filename));

    let hub_base = if hub_url.starts_with("ws://") {
        format!("http://{}", &hub_url[5..].trim_end_matches("/ws/bridge").trim_end_matches("/ws"))
    } else if hub_url.starts_with("wss://") {
        format!("https://{}", &hub_url[6..].trim_end_matches("/ws/bridge").trim_end_matches("/ws"))
    } else {
        hub_url.trim_end_matches('/').to_string()
    };

    let stream_url = format!(
        "{}/api/binaries/stream?sourcePcId={}&filename={}",
        hub_base,
        urlencoding_encode(&source_pc_id),
        urlencoding_encode(&filename)
    );

    let client = match reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
                source_pc_id: source_pc_id.clone(),
                target_pc_id: target_pc_id.clone(),
                filename: filename.clone(),
                progress_pct: 0,
                speed_mb: None,
                downloaded_bytes: 0,
                total_bytes: 0,
                status: "failed".to_string(),
                error: Some(format!("Gagal membuat HTTP client: {}", e)),
            }).await;
            return;
        }
    };

    // Check if we can resume from existing .part file
    let mut existing_bytes = 0u64;
    if let Ok(meta) = tokio::fs::metadata(&part_dest).await {
        existing_bytes = meta.len();
    }

    let mut req = client.get(&stream_url);
    if existing_bytes > 0 {
        req = req.header("Range", format!("bytes={}-", existing_bytes));
    }

    let res = match req.send().await {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
                source_pc_id: source_pc_id.clone(),
                target_pc_id: target_pc_id.clone(),
                filename: filename.clone(),
                progress_pct: 0,
                speed_mb: None,
                downloaded_bytes: 0,
                total_bytes: 0,
                status: "failed".to_string(),
                error: Some(format!("Stream endpoint merespons HTTP status {}", r.status())),
            }).await;
            return;
        }
        Err(e) => {
            let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
                source_pc_id: source_pc_id.clone(),
                target_pc_id: target_pc_id.clone(),
                filename: filename.clone(),
                progress_pct: 0,
                speed_mb: None,
                downloaded_bytes: 0,
                total_bytes: 0,
                status: "failed".to_string(),
                error: Some(format!("Gagal menghubungi stream hub: {}", e)),
            }).await;
            return;
        }
    };

    let is_partial = res.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let total_bytes = if is_partial {
        if let Some(cr) = res.headers().get("content-range").and_then(|h| h.to_str().ok()) {
            if let Some(slash_idx) = cr.rfind('/') {
                cr[slash_idx + 1..].trim().parse::<u64>().unwrap_or_else(|_| existing_bytes + res.content_length().unwrap_or(0))
            } else {
                existing_bytes + res.content_length().unwrap_or(0)
            }
        } else {
            existing_bytes + res.content_length().unwrap_or(0)
        }
    } else {
        existing_bytes = 0;
        res.content_length().unwrap_or(0)
    };

    let mut file = match if is_partial && existing_bytes > 0 {
        tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&part_dest)
            .await
    } else {
        tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&part_dest)
            .await
    } {
        Ok(f) => f,
        Err(e) => {
            let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
                source_pc_id: source_pc_id.clone(),
                target_pc_id: target_pc_id.clone(),
                filename: filename.clone(),
                progress_pct: 0,
                speed_mb: None,
                downloaded_bytes: 0,
                total_bytes: 0,
                status: "failed".to_string(),
                error: Some(format!("Gagal membuka file part: {}", e)),
            }).await;
            return;
        }
    };

    // Register active transfer watch channel
    let (tx_signal, rx_signal) = watch::channel(TransferSignal::Running);
    {
        let mut map = get_active_transfers().lock().await;
        map.insert(filename.clone(), tx_signal);
    }

    let mut stream = res.bytes_stream();
    let mut downloaded_bytes = existing_bytes;
    let start_time = std::time::Instant::now();
    let mut session_bytes = 0u64;
    let mut last_log_time = std::time::Instant::now();
    let mut last_pct = if total_bytes > 0 {
        ((downloaded_bytes as f64 / total_bytes as f64) * 100.0) as u32
    } else {
        0
    };

    while let Some(chunk_res) = stream.next().await {
        // Check signal for Pause or Cancel
        let current_signal = *rx_signal.borrow();
        if current_signal == TransferSignal::Pause {
            let _ = tokio::io::AsyncWriteExt::flush(&mut file).await;
            drop(file);
            {
                let mut map = get_active_transfers().lock().await;
                map.remove(&filename);
            }
            let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
                source_pc_id: source_pc_id.clone(),
                target_pc_id: target_pc_id.clone(),
                filename: filename.clone(),
                progress_pct: last_pct,
                speed_mb: None,
                downloaded_bytes,
                total_bytes,
                status: "paused".to_string(),
                error: None,
            }).await;
            return;
        } else if current_signal == TransferSignal::Cancel {
            drop(file);
            let _ = tokio::fs::remove_file(&part_dest).await;
            {
                let mut map = get_active_transfers().lock().await;
                map.remove(&filename);
            }
            let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
                source_pc_id: source_pc_id.clone(),
                target_pc_id: target_pc_id.clone(),
                filename: filename.clone(),
                progress_pct: 0,
                speed_mb: None,
                downloaded_bytes: 0,
                total_bytes: 0,
                status: "cancelled".to_string(),
                error: None,
            }).await;
            return;
        }

        let chunk = match chunk_res {
            Ok(c) => c,
            Err(e) => {
                {
                    let mut map = get_active_transfers().lock().await;
                    map.remove(&filename);
                }
                let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
                    source_pc_id: source_pc_id.clone(),
                    target_pc_id: target_pc_id.clone(),
                    filename: filename.clone(),
                    progress_pct: last_pct,
                    speed_mb: None,
                    downloaded_bytes,
                    total_bytes,
                    status: "failed".to_string(),
                    error: Some(format!("Gagal membaca chunk: {}", e)),
                }).await;
                return;
            }
        };

        if let Err(e) = tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await {
            {
                let mut map = get_active_transfers().lock().await;
                map.remove(&filename);
            }
            let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
                source_pc_id: source_pc_id.clone(),
                target_pc_id: target_pc_id.clone(),
                filename: filename.clone(),
                progress_pct: last_pct,
                speed_mb: None,
                downloaded_bytes,
                total_bytes,
                status: "failed".to_string(),
                error: Some(format!("Gagal menulis ke disk: {}", e)),
            }).await;
            return;
        }

        let chunk_len = chunk.len() as u64;
        downloaded_bytes += chunk_len;
        session_bytes += chunk_len;

        let pct = if total_bytes > 0 {
            ((downloaded_bytes as f64 / total_bytes as f64) * 100.0).min(100.0) as u32
        } else {
            0
        };

        if last_log_time.elapsed() >= Duration::from_millis(400) || pct == 100 {
            last_log_time = std::time::Instant::now();
            let elapsed_sec = start_time.elapsed().as_secs_f64().max(0.001);
            let speed_mb_s = (session_bytes as f64 / (1024.0 * 1024.0)) / elapsed_sec;
            let speed_str = format!("{:.1}", speed_mb_s);

            last_pct = pct;
            let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
                source_pc_id: source_pc_id.clone(),
                target_pc_id: target_pc_id.clone(),
                filename: filename.clone(),
                progress_pct: pct,
                speed_mb: Some(speed_str),
                downloaded_bytes,
                total_bytes,
                status: if pct >= 100 { "completed".to_string() } else { "transferring".to_string() },
                error: None,
            }).await;
        }
    }

    {
        let mut map = get_active_transfers().lock().await;
        map.remove(&filename);
    }

    let _ = tokio::io::AsyncWriteExt::flush(&mut file).await;
    drop(file);

    if let Err(e) = tokio::fs::rename(&part_dest, &final_dest).await {
        let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
            source_pc_id: source_pc_id.clone(),
            target_pc_id: target_pc_id.clone(),
            filename: filename.clone(),
            progress_pct: 100,
            speed_mb: None,
            downloaded_bytes,
            total_bytes,
            status: "failed".to_string(),
            error: Some(format!("Gagal rename file final: {}", e)),
        }).await;
        return;
    }

    // Final completed event
    let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
        source_pc_id,
        target_pc_id,
        filename,
        progress_pct: 100,
        speed_mb: None,
        downloaded_bytes,
        total_bytes,
        status: "completed".to_string(),
        error: None,
    }).await;

    // Rescan and send updated binaries
    let updated_bins = crate::scanner::scan_local_binaries(None, false);
    let _ = tx.send(OutgoingMessage::BinaryList { binaries: updated_bins }).await;
}

pub async fn control_binary_transfer(
    action: String,
    target_pc_id: String,
    filename: String,
    source_pc_id: Option<String>,
    hub_url: String,
    tx: Sender<OutgoingMessage>,
) {
    match action.as_str() {
        "pause" => {
            let map = get_active_transfers().lock().await;
            if let Some(signal_tx) = map.get(&filename) {
                let _ = signal_tx.send(TransferSignal::Pause);
            } else {
                let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
                    source_pc_id: source_pc_id.unwrap_or_default(),
                    target_pc_id,
                    filename,
                    progress_pct: 0,
                    speed_mb: None,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    status: "paused".to_string(),
                    error: None,
                }).await;
            }
        }
        "cancel" => {
            let map = get_active_transfers().lock().await;
            if let Some(signal_tx) = map.get(&filename) {
                let _ = signal_tx.send(TransferSignal::Cancel);
            } else {
                let target_dir = get_target_firmware_dir();
                let part_dest = target_dir.join(format!("{}.part", &filename));
                let _ = tokio::fs::remove_file(&part_dest).await;
                let _ = tx.send(OutgoingMessage::BinaryCopyProgress {
                    source_pc_id: source_pc_id.unwrap_or_default(),
                    target_pc_id,
                    filename,
                    progress_pct: 0,
                    speed_mb: None,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    status: "cancelled".to_string(),
                    error: None,
                }).await;
            }
        }
        "resume" => {
            let src = source_pc_id.unwrap_or_default();
            tokio::spawn(async move {
                download_binary_file(
                    src,
                    target_pc_id,
                    filename,
                    None,
                    hub_url,
                    tx,
                ).await;
            });
        }
        _ => {}
    }
}

fn urlencoding_encode(s: &str) -> String {
    let mut res = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            res.push(b as char);
        } else {
            res.push_str(&format!("%{:02X}", b));
        }
    }
    res
}
