use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

// ponytail: Minimal Zero-Dependency High-Speed Async HTTP File Streaming Server on Port 4005
pub async fn start_stream_server(port: u16) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            println!("[Stream Server] 🚀 Mini HTTP binary streamer listening on http://{}", addr);
            l
        }
        Err(e) => {
            eprintln!("[Stream Server] ⚠️ Failed to bind stream server on {}: {}", addr, e);
            return;
        }
    };

    loop {
        match listener.accept().await {
            Ok((socket, _peer)) => {
                tokio::spawn(async move {
                    handle_connection(socket).await;
                });
            }
            Err(e) => {
                eprintln!("[Stream Server] Accept error: {}", e);
            }
        }
    }
}

fn extract_query_param(query: &str, key: &str) -> Option<String> {
    for part in query.split('&') {
        let mut kv = part.splitn(2, '=');
        if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
            if k == key {
                if let Ok(decoded) = urlencoding_decode(v) {
                    return Some(decoded);
                }
                return Some(v.to_string());
            }
        }
    }
    None
}

fn urlencoding_decode(s: &str) -> Result<String, ()> {
    let mut res = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(val) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                res.push(val);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            res.push(b' ');
            i += 1;
            continue;
        }
        res.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(res).map_err(|_| ())
}

async fn handle_connection(mut socket: TcpStream) {
    let mut buf = [0u8; 4096];
    let n = match socket.read(&mut buf).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let req_str = String::from_utf8_lossy(&buf[..n]);
    let mut lines = req_str.lines();
    let req_line = match lines.next() {
        Some(l) => l,
        None => return,
    };

    let mut parts = req_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let full_path = parts.next().unwrap_or("");

    if method != "GET" && method != "HEAD" {
        let resp = "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n";
        let _ = socket.write_all(resp.as_bytes()).await;
        return;
    }

    let (path_part, query_part) = match full_path.find('?') {
        Some(idx) => (&full_path[..idx], &full_path[idx + 1..]),
        None => (full_path, ""),
    };

    if path_part != "/stream" && path_part != "/api/binaries/stream" {
        let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
        let _ = socket.write_all(resp.as_bytes()).await;
        return;
    }

    // Extract requested target path or filename
    let raw_target = extract_query_param(query_part, "path")
        .or_else(|| extract_query_param(query_part, "filename"))
        .unwrap_or_default();

    if raw_target.is_empty() {
        let resp = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n";
        let _ = socket.write_all(resp.as_bytes()).await;
        return;
    }

    // Locate file
    let mut target_file: Option<PathBuf> = None;
    let direct_path = PathBuf::from(&raw_target);
    if direct_path.exists() && direct_path.is_file() {
        target_file = Some(direct_path);
    } else {
        // Search scanned binaries
        let scanned = crate::scanner::scan_local_binaries(None, false);
        if let Some(found) = scanned.iter().find(|b| b.filename == raw_target || b.path.ends_with(&raw_target)) {
            let p = PathBuf::from(&found.path);
            if p.exists() && p.is_file() {
                target_file = Some(p);
            }
        }
    }

    let file_path = match target_file {
        Some(p) => p,
        None => {
            let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
            let _ = socket.write_all(resp.as_bytes()).await;
            return;
        }
    };

    let meta = match tokio::fs::metadata(&file_path).await {
        Ok(m) => m,
        Err(_) => {
            let resp = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n";
            let _ = socket.write_all(resp.as_bytes()).await;
            return;
        }
    };

    let total_size = meta.len();
    let filename = file_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "firmware.bin".to_string());

    // Check Range header
    let mut range_start = 0u64;
    let mut range_end = total_size.saturating_sub(1);
    let mut is_partial = false;

    for line in lines {
        let lower = line.to_lowercase();
        if lower.starts_with("range:") {
            if let Some(range_val) = line.split(':').nth(1) {
                let range_val = range_val.trim();
                if range_val.starts_with("bytes=") {
                    let range_spec = &range_val[6..];
                    let mut rparts = range_spec.split('-');
                    if let Some(s) = rparts.next().and_then(|s| s.parse::<u64>().ok()) {
                        range_start = s;
                        is_partial = true;
                    }
                    if let Some(e) = rparts.next().and_then(|s| s.parse::<u64>().ok()) {
                        if e < total_size {
                            range_end = e;
                            is_partial = true;
                        }
                    }
                }
            }
        }
    }

    let content_length = if range_end >= range_start {
        range_end - range_start + 1
    } else {
        0
    };

    let mut file = match tokio::fs::File::open(&file_path).await {
        Ok(f) => f,
        Err(_) => {
            let resp = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n";
            let _ = socket.write_all(resp.as_bytes()).await;
            return;
        }
    };

    if is_partial {
        let header = format!(
            "HTTP/1.1 206 Partial Content\r\n\
            Content-Type: application/octet-stream\r\n\
            Content-Length: {}\r\n\
            Content-Range: bytes {}-{}/{}\r\n\
            Accept-Ranges: bytes\r\n\
            Access-Control-Allow-Origin: *\r\n\
            Content-Disposition: attachment; filename=\"{}\"\r\n\r\n",
            content_length, range_start, range_end, total_size, filename
        );
        if socket.write_all(header.as_bytes()).await.is_err() {
            return;
        }
    } else {
        let header = format!(
            "HTTP/1.1 200 OK\r\n\
            Content-Type: application/octet-stream\r\n\
            Content-Length: {}\r\n\
            Accept-Ranges: bytes\r\n\
            Access-Control-Allow-Origin: *\r\n\
            Content-Disposition: attachment; filename=\"{}\"\r\n\r\n",
            total_size, filename
        );
        if socket.write_all(header.as_bytes()).await.is_err() {
            return;
        }
    }

    if method == "HEAD" {
        return;
    }

    if range_start > 0 {
        if file.seek(std::io::SeekFrom::Start(range_start)).await.is_err() {
            return;
        }
    }

    let mut stream_reader = file.take(content_length);
    let mut pipe_buf = vec![0u8; 128 * 1024]; // 128KB fast stream buffer
    loop {
        match stream_reader.read(&mut pipe_buf).await {
            Ok(0) => break,
            Ok(n) => {
                if socket.write_all(&pipe_buf[..n]).await.is_err() {
                    break;
                }
            }
            Err(_) => break,
        }
    }
}
