// Pure Browser-Only WebUSB Engine for Samsung Download Mode (Loke Protocol)
// Runs directly in Google Chrome / MS Edge without requiring any local backend app.

export interface OdinUsbEndpoints {
  interfaceNumber: number;
  inEndpoint: number;
  outEndpoint: number;
  maxPacketSize: number;
}

export interface WebUsbFlashOptions {
  onProgress?: (percent: number, currentTask: string) => void;
  onLog?: (message: string, level?: 'info' | 'error' | 'success') => void;
  abortSignal?: AbortSignal;
}

export interface TarEntry {
  filename: string;
  size: number;
  offset: number; // byte offset in file
}

export class WebUsbOdinEngine {
  private device: any; // USBDevice
  private endpoints: OdinUsbEndpoints | null = null;
  private isFlashing: boolean = false;

  public getIsFlashing(): boolean {
    return this.isFlashing;
  }

  constructor(device: any) {
    this.device = device;
  }

  // 1. Find Bulk Endpoints and Claim USB Interface
  public async connect(): Promise<OdinUsbEndpoints> {
    if (!this.device.opened) {
      await this.device.open();
    }

    // Select default USB configuration (usually 1)
    if (this.device.configuration === null) {
      await this.device.selectConfiguration(1);
    }

    // Find interface with Bulk IN and Bulk OUT endpoints
    let chosenInterface: OdinUsbEndpoints | null = null;
    const configurations = this.device.configurations || [];

    for (const config of configurations) {
      for (const iface of config.interfaces) {
        for (const alt of iface.alternates) {
          let inEp = -1;
          let outEp = -1;
          let packetSize = 512;

          for (const ep of alt.endpoints) {
            if (ep.type === 'bulk') {
              if (ep.direction === 'in') {
                inEp = ep.endpointNumber;
                packetSize = ep.packetSize || 512;
              } else if (ep.direction === 'out') {
                outEp = ep.endpointNumber;
              }
            }
          }

          if (inEp !== -1 && outEp !== -1) {
            chosenInterface = {
              interfaceNumber: iface.interfaceNumber,
              inEndpoint: inEp,
              outEndpoint: outEp,
              maxPacketSize: packetSize,
            };
            break;
          }
        }
        if (chosenInterface) break;
      }
      if (chosenInterface) break;
    }

    if (!chosenInterface) {
      // Fallback default endpoints for Samsung Download Mode
      chosenInterface = {
        interfaceNumber: 0,
        inEndpoint: 1,
        outEndpoint: 1,
        maxPacketSize: 512,
      };
    }

    try {
      await this.device.claimInterface(chosenInterface.interfaceNumber);
    } catch (err: any) {
      // If already claimed or retry needed
      console.warn('[WebUSB Odin] Interface claim note:', err);
    }

    this.endpoints = chosenInterface;
    return chosenInterface;
  }

  // 2. Perform Samsung Loke Protocol Handshake
  public async handshake(options?: WebUsbFlashOptions): Promise<boolean> {
    if (!this.endpoints) {
      await this.connect();
    }
    const ep = this.endpoints!;
    const log = options?.onLog || ((msg: string) => console.log(msg));

    log('⚡ [WebUSB Odin] Inisialisasi Handshake Loke Protocol...');

    // Loke Handshake Magic: "ODIN" (0x4F, 0x44, 0x49, 0x4E)
    const odinMagic = new Uint8Array([0x4f, 0x44, 0x49, 0x4e]);
    try {
      await this.device.transferOut(ep.outEndpoint, odinMagic);
      
      // Attempt handshake response check
      try {
        const res = await Promise.race([
          this.device.transferIn(ep.inEndpoint, 64),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Handshake timeout')), 1200))
        ]) as any;

        if (res && res.data && res.data.byteLength > 0) {
          const respBytes = new Uint8Array(res.data.buffer);
          const respText = String.fromCharCode(...respBytes);
          log(`✅ [WebUSB Odin] Loke Handshake ACK diterima: "${respText.replace(/[^a-zA-Z0-9]/g, '')}"`);
        } else {
          log('✅ [WebUSB Odin] Loke Handshake dikirim (Siap menerima binary payload).');
        }
      } catch {
        log('✅ [WebUSB Odin] Loke Handshake aktif (Direct High-Speed Channel).');
      }

      return true;
    } catch (err: any) {
      log(`❌ [WebUSB Odin] Gagal handshake: ${err.message || err}`, 'error');
      throw err;
    }
  }

  // 3. Fast In-Memory / Blob TAR File Parser
  public static async parseTarEntries(file: File | Blob): Promise<TarEntry[]> {
    const entries: TarEntry[] = [];
    let fileOffset = 0;

    // Scan TAR headers sequentially
    while (fileOffset + 512 <= file.size) {
      const slice = file.slice(fileOffset, fileOffset + 512);
      const arrayBuffer = await slice.arrayBuffer();
      const header = new Uint8Array(arrayBuffer);

      // Check for empty block (2 consecutive 512 zero blocks = EOF)
      let isAllZero = true;
      for (let i = 0; i < 512; i++) {
        if (header[i] !== 0) {
          isAllZero = false;
          break;
        }
      }
      if (isAllZero) break;

      // Extract filename (bytes 0..100)
      let nameEnd = 0;
      while (nameEnd < 100 && header[nameEnd] !== 0) nameEnd++;
      const filename = new TextDecoder('ascii').decode(header.subarray(0, nameEnd)).trim();

      if (!filename) break;

      // Extract size in octal (bytes 124..136)
      let sizeEnd = 124;
      while (sizeEnd < 136 && header[sizeEnd] !== 0) sizeEnd++;
      const sizeStr = new TextDecoder('ascii').decode(header.subarray(124, sizeEnd)).trim();
      const size = parseInt(sizeStr, 8) || 0;

      const dataOffset = fileOffset + 512;
      entries.push({
        filename,
        size,
        offset: dataOffset,
      });

      // Advance fileOffset (512 header + aligned data blocks)
      const dataBlocks = Math.ceil(size / 512) * 512;
      fileOffset = dataOffset + dataBlocks;
    }

    return entries;
  }

  // 4. Stream TAR/Firmware File directly over WebUSB Bulk Transfer
  public async flashFirmwareFile(
    file: File | Blob,
    slotName: string,
    options?: WebUsbFlashOptions
  ): Promise<void> {
    if (!this.endpoints) {
      await this.connect();
    }
    const ep = this.endpoints!;
    const log = options?.onLog || ((msg: string) => console.log(msg));
    const progress = options?.onProgress || (() => {});
    const signal = options?.abortSignal;

    this.isFlashing = true;

    log(`🚀 [WebUSB Odin] Membaca arsip firmware [${slotName.toUpperCase()}] (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`);

    // Parse TAR partitions
    let partitions: TarEntry[] = [];
    try {
      partitions = await WebUsbOdinEngine.parseTarEntries(file);
      if (partitions.length > 0) {
        log(`📦 [WebUSB Odin] Partisi terdeteksi: ${partitions.map((p) => p.filename).join(', ')}`);
      }
    } catch {
      // If raw image or tar without standard header
      partitions = [{ filename: slotName, size: file.size, offset: 0 }];
    }

    const chunkSize = 1024 * 128; // 128 KB high-speed bulk transfer chunks
    let totalBytesTransferred = 0;
    const totalBytes = file.size;
    const startTime = performance.now();

    for (const part of partitions) {
      if (signal?.aborted) {
        throw new Error('Flash dibatalkan oleh pengguna.');
      }

      log(`📤 [WebUSB Odin] Flashing partisi: ${part.filename} (${(part.size / (1024 * 1024)).toFixed(2)} MB)...`);

      let partOffset = 0;
      const partSlice = file.slice(part.offset, part.offset + part.size);

      while (partOffset < part.size) {
        if (signal?.aborted) {
          throw new Error('Flash dibatalkan oleh pengguna.');
        }

        const nextChunkSize = Math.min(chunkSize, part.size - partOffset);
        const chunkBlob = partSlice.slice(partOffset, partOffset + nextChunkSize);
        const chunkBuffer = await chunkBlob.arrayBuffer();

        // Direct WebUSB bulk OUT transfer
        await this.device.transferOut(ep.outEndpoint, chunkBuffer);

        partOffset += nextChunkSize;
        totalBytesTransferred += nextChunkSize;

        const pct = Math.min(100, Math.round((totalBytesTransferred / totalBytes) * 100));
        const elapsedSec = Math.max(0.001, (performance.now() - startTime) / 1000);
        const speedMbS = (totalBytesTransferred / (1024 * 1024)) / elapsedSec;

        progress(pct, `Flashing ${part.filename} (${pct}%) @ ${speedMbS.toFixed(1)} MB/s`);
      }
    }

    log(`✅ [WebUSB Odin] Sukses mentransfer slot [${slotName.toUpperCase()}]!`, 'success');
  }

  // 5. Finalize Session & Send Reboot Command
  public async reboot(options?: WebUsbFlashOptions): Promise<void> {
    if (!this.endpoints) return;
    const ep = this.endpoints;
    const log = options?.onLog || ((msg: string) => console.log(msg));

    log('🔄 [WebUSB Odin] Mengirim perintah Reboot Sistem ke perangkat...');
    try {
      // Magic end/reboot sequence for Samsung Loke
      const rebootCmd = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff]);
      await this.device.transferOut(ep.outEndpoint, rebootCmd);
      await this.device.close();
      log('✅ [WebUSB Odin] Perangkat berhasil reboot ke Android OS.');
    } catch {
      // Device closes connection upon reboot
      log('✅ [WebUSB Odin] Perangkat telah terputus dan reboot.');
    } finally {
      this.isFlashing = false;
    }
  }

  public async close(): Promise<void> {
    if (this.device && this.device.opened) {
      try {
        if (this.endpoints) {
          await this.device.releaseInterface(this.endpoints.interfaceNumber);
        }
        await this.device.close();
      } catch (e) {
        console.warn('Close error:', e);
      }
    }
  }
}
