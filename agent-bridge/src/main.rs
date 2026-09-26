mod protocol;
mod scanner;
mod updater;

use futures_util::{SinkExt, StreamExt};
use protocol::{IncomingMessage, OutgoingMessage};
use std::env;
use std::time::Duration;
use tokio::time::sleep;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

fn get_pc_id() -> String {
    if let Ok(val) = env::var("PC_ID") {
        return val;
    }
    let os_name = if cfg!(target_os = "windows") { "WIN" } else { "UBUNTU" };
    let host = match hostname::get() {
        Ok(h) => h.to_string_lossy().to_string().to_uppercase(),
        Err(_) => "NODE-01".to_string(),
    };
    format!("{}-{}", os_name, host)
}

fn get_os_type() -> String {
    if cfg!(target_os = "windows") {
        "windows".to_string()
    } else {
        "ubuntu".to_string()
    }
}

#[tokio::main]
async fn main() {
    let hub_url = env::var("HUB_URL").unwrap_or_else(|_| "ws://127.0.0.1:4000/ws/bridge".to_string());
    let pc_id = get_pc_id();
    let os_type = get_os_type();

    println!("==================================================");
    println!(" Octopus Lightweight Agent Bridge");
    println!(" PC ID:   {}", pc_id);
    println!(" OS:      {}", os_type);
    println!(" Hub URL: {}", hub_url);
    println!("==================================================");

    loop {
        println!("[Bridge] Connecting to Hub Server: {} ...", hub_url);

        match connect_async(&hub_url).await {
            Ok((ws_stream, _)) => {
                println!("[Bridge] Connected successfully! Registering PC ID: {}", pc_id);
                let (mut write, mut read) = ws_stream.split();

                // 1. Send Register Message
                let reg_msg = OutgoingMessage::Register {
                    pc_id: pc_id.clone(),
                    os: os_type.clone(),
                };
                if let Ok(json) = serde_json::to_string(&reg_msg) {
                    let _ = write.send(Message::Text(json.into())).await;
                }

                // 2. Spawn device scanner loop
                let (tx, mut rx) = tokio::sync::mpsc::channel::<OutgoingMessage>(32);

                let scanner_handle = tokio::spawn(async move {
                    loop {
                        let devices = scanner::scan_all_devices();
                        let update = OutgoingMessage::DeviceList { devices };
                        if tx.send(update).await.is_err() {
                            break;
                        }
                        sleep(Duration::from_secs(2)).await;
                    }
                });

                // 3. Main message forwarding & handling loop
                loop {
                    tokio::select! {
                        Some(out_msg) = rx.recv() => {
                            if let Ok(json) = serde_json::to_string(&out_msg) {
                                if write.send(Message::Text(json.into())).await.is_err() {
                                    break;
                                }
                            }
                        }
                        Some(msg_result) = read.next() => {
                            match msg_result {
                                Ok(Message::Text(text)) => {
                                    if let Ok(incoming) = serde_json::from_str::<IncomingMessage>(&text) {
                                        match incoming {
                                            IncomingMessage::Execute(exec) => {
                                                println!("[Bridge Command] Target Device: {}, Action: {}", exec.device_id, exec.action);
                                                if exec.action == "SELF_UPDATE" || exec.action == "UPDATE_AGENT" {
                                                    let repo = "endrisusanto/octopus";
                                                    let target_ver = exec.params
                                                        .as_ref()
                                                        .and_then(|p| p.get("targetVersion"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("latest");
                                                    let res = updater::trigger_silent_update(repo, target_ver).await;
                                                    let log_msg = OutgoingMessage::LogStream {
                                                        device_id: None,
                                                        level: if res.success { "info".to_string() } else { "error".to_string() },
                                                        message: format!("[Updater] {}", res.message),
                                                    };
                                                    if let Ok(json) = serde_json::to_string(&log_msg) {
                                                        let _ = write.send(Message::Text(json.into())).await;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                Ok(Message::Close(_)) | Err(_) => {
                                    println!("[Bridge] Connection closed by Hub Server");
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                }

                scanner_handle.abort();
            }
            Err(err) => {
                eprintln!("[Bridge] Connection failed: {}. Retrying in 3 seconds...", err);
            }
        }

        sleep(Duration::from_secs(3)).await;
    }
}
