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
    #[serde(rename = "batteryLevel")]
    pub battery_level: Option<u32>,
    #[serde(rename = "batteryTemp")]
    pub battery_temp: Option<f32>,
    #[serde(rename = "torchOn")]
    pub torch_on: Option<bool>,
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
    #[serde(rename = "RACK_CALIBRATION_SYNC")]
    RackCalibrationSync {
        calibration: serde_json::Value,
    },
    #[serde(rename = "TORCH_STATUS_UPDATE")]
    TorchStatusUpdate {
        #[serde(rename = "deviceId")]
        device_id: String,
        #[serde(rename = "torchOn")]
        torch_on: bool,
    },
    #[serde(rename = "BINARY_COPY_PROGRESS")]
    BinaryCopyProgress {
        #[serde(rename = "sourcePcId")]
        source_pc_id: String,
        #[serde(rename = "targetPcId")]
        target_pc_id: String,
        filename: String,
        #[serde(rename = "progressPct")]
        progress_pct: u32,
        #[serde(rename = "speedMb")]
        speed_mb: Option<String>,
        #[serde(rename = "downloadedBytes")]
        downloaded_bytes: u64,
        #[serde(rename = "totalBytes")]
        total_bytes: u64,
        status: String,
        error: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutePayload {
    pub device_id: String,
    pub action: String,
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadBinaryPayload {
    pub source_pc_id: String,
    pub target_pc_id: String,
    pub filename: String,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum IncomingMessage {
    #[serde(rename = "EXECUTE_COMMAND")]
    Execute(ExecutePayload),
    #[serde(rename = "DOWNLOAD_BINARY_COMMAND")]
    DownloadBinary(DownloadBinaryPayload),
}
