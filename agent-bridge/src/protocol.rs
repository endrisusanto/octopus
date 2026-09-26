use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceInfo {
    pub id: String,
    pub port: String,
    pub serial: Option<String>,
    pub model: String,
    pub mode: String, // "odin", "adb", "recovery", "offline"
    pub status: String, // "Ready", "Flashing...", "Pass", "Fail"
    pub progress: Option<u32>,
    pub current_task: Option<String>,
    pub battery_level: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BinaryFileInfo {
    pub filename: String,
    pub path: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum OutgoingMessage {
    #[serde(rename = "BRIDGE_REGISTER")]
    Register {
        #[serde(rename = "pcId")]
        pc_id: String,
        os: String,
    },
    #[serde(rename = "DEVICE_LIST_UPDATE")]
    DeviceList { devices: Vec<DeviceInfo> },
    #[serde(rename = "BINARY_LIST_UPDATE")]
    BinaryList { binaries: Vec<BinaryFileInfo> },
    #[serde(rename = "DEVICE_PROGRESS")]
    DeviceProgress {
        #[serde(rename = "deviceId")]
        device_id: String,
        progress: u32,
        status: Option<String>,
        #[serde(rename = "currentTask")]
        current_task: Option<String>,
    },
    #[serde(rename = "LOG_STREAM")]
    LogStream {
        #[serde(rename = "deviceId")]
        device_id: Option<String>,
        level: String,
        message: String,
    },
    #[serde(rename = "MD5_PROGRESS")]
    Md5Progress {
        #[serde(rename = "slotKey")]
        slot_key: String,
        filename: String,
        progress: u32,
        status: String,
        #[serde(rename = "calculatedMd5")]
        calculated_md5: Option<String>,
        #[serde(rename = "errorMessage")]
        error_message: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutePayload {
    pub device_id: String,
    pub action: String,
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum IncomingMessage {
    #[serde(rename = "EXECUTE_COMMAND")]
    Execute(ExecutePayload),
}
