use std::fs::File;
use std::io::Read;
use std::path::Path;
use tokio::sync::mpsc::Sender;
use crate::protocol::OutgoingMessage;

pub async fn verify_firmware_md5_task(
    slot_key: String,
    file_path: String,
    filename: String,
    tx: Sender<OutgoingMessage>,
) {
    let path = Path::new(&file_path);
    if !path.exists() {
        let _ = tx.send(OutgoingMessage::Md5Progress {
            slot_key: slot_key.clone(),
            filename: filename.clone(),
            progress: 0,
            status: "error".to_string(),
            calculated_md5: None,
            error_message: Some(format!("File not found: {}", file_path)),
        }).await;
        return;
    }

    let file = match File::open(path) {
        Ok(f) => f,
        Err(e) => {
            let _ = tx.send(OutgoingMessage::Md5Progress {
                slot_key: slot_key.clone(),
                filename: filename.clone(),
                progress: 0,
                status: "error".to_string(),
                calculated_md5: None,
                error_message: Some(format!("Failed to open file: {}", e)),
            }).await;
            return;
        }
    };

    let total_size = file.metadata().map(|m| m.len()).unwrap_or(0);
    if total_size == 0 {
        let _ = tx.send(OutgoingMessage::Md5Progress {
            slot_key: slot_key.clone(),
            filename: filename.clone(),
            progress: 100,
            status: "verified".to_string(),
            calculated_md5: None,
            error_message: None,
        }).await;
        return;
    }

    // Read file in 8MB chunks for maximum NVMe/SSD/HDD throughput
    let chunk_size = 8 * 1024 * 1024;
    let mut reader = std::io::BufReader::with_capacity(chunk_size, file);
    let mut context = md5::Context::new();
    let mut buffer = vec![0u8; chunk_size];
    let mut bytes_read_total = 0u64;
    let mut last_reported_pct = 0u32;

    // Send initial 0% progress
    let _ = tx.send(OutgoingMessage::Md5Progress {
        slot_key: slot_key.clone(),
        filename: filename.clone(),
        progress: 0,
        status: "verifying".to_string(),
        calculated_md5: None,
        error_message: None,
    }).await;

    loop {
        // Yield to allow instant cancellation on abort
        tokio::task::yield_now().await;

        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                context.consume(&buffer[..n]);
                bytes_read_total += n as u64;

                let pct = ((bytes_read_total as f64 / total_size as f64) * 100.0) as u32;
                if pct != last_reported_pct && (pct % 2 == 0 || pct == 100) {
                    last_reported_pct = pct;
                    let _ = tx.send(OutgoingMessage::Md5Progress {
                        slot_key: slot_key.clone(),
                        filename: filename.clone(),
                        progress: pct,
                        status: if pct >= 100 { "verified".to_string() } else { "verifying".to_string() },
                        calculated_md5: None,
                        error_message: None,
                    }).await;
                }
            }
            Err(e) => {
                let _ = tx.send(OutgoingMessage::Md5Progress {
                    slot_key: slot_key.clone(),
                    filename: filename.clone(),
                    progress: 0,
                    status: "error".to_string(),
                    calculated_md5: None,
                    error_message: Some(format!("Read error: {}", e)),
                }).await;
                return;
            }
        }
    }

    let digest = context.compute();
    let hash_str = format!("{:x}", digest);

    // Send final verified notification with computed hash
    let _ = tx.send(OutgoingMessage::Md5Progress {
        slot_key,
        filename,
        progress: 100,
        status: "verified".to_string(),
        calculated_md5: Some(hash_str),
        error_message: None,
    }).await;
}
