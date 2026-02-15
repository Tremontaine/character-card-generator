// PNG Encoder for SillyTavern Character Cards
class PNGEncoder {
  constructor() {
    this.PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    this.config = window.config;
  }

  // Create a PNG file from image blob and embed character data
  async createCharacterCard(imageBlob, characterData) {
    try {
      // Create character card JSON (compact format, no spaces like Python version)
      const characterJson = JSON.stringify(characterData);

      // Convert to base64 like Python version
      const characterJsonBytes = new TextEncoder().encode(characterJson);
      const base64Json = btoa(String.fromCharCode(...characterJsonBytes));

      // Inject metadata into existing PNG instead of recreating from scratch
      // This is much more efficient and preserves the original compression
      const pngBlob = await this.injectMetadataIntoPNG(imageBlob, base64Json);
      return pngBlob;
    } catch (error) {
      console.error("Error creating character card:", error);
      throw error;
    }
  }

  // Inject metadata into existing PNG (more efficient than recreating)
  async injectMetadataIntoPNG(pngBlob, base64Json) {
    try {
      console.log("🔍 Starting PNG metadata injection");
      console.log("📏 Input blob size:", pngBlob.size, "bytes");
      console.log("📝 Base64 JSON size:", base64Json.length, "characters");

      // Validate blob before attempting to read
      if (!pngBlob || !(pngBlob instanceof Blob)) {
        throw new Error("Invalid blob provided");
      }

      const arrayBuffer = await pngBlob.arrayBuffer();

      // Validate arrayBuffer was successfully obtained
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error("Failed to read blob data");
      }

      const data = new Uint8Array(arrayBuffer);

      // Verify PNG signature
      if (!this.verifyPNGSignature(data)) {
        throw new Error("Invalid PNG file - using full recreation");
      }

      // Check for existing chara chunks and remove them to prevent duplicates
      const cleanedData = this.removeExistingCharaChunks(data);

      // Find the position to insert the tEXt chunk (before IEND)
      let iendPosition = this.findIENDPosition(cleanedData);
      if (iendPosition === -1) {
        throw new Error(
          "Could not find IEND chunk in PNG - using full recreation",
        );
      }

      // Create the character data chunk
      const charaChunk = this.createtEXtChunk("chara", base64Json);

      // Create new PNG with the metadata chunk inserted before IEND
      const newPngData = new Uint8Array(cleanedData.length + charaChunk.length);

      // Copy data up to IEND
      newPngData.set(cleanedData.slice(0, iendPosition), 0);

      // Insert tEXt chunk
      newPngData.set(charaChunk, iendPosition);

      // Copy IEND chunk
      newPngData.set(
        cleanedData.slice(iendPosition),
        iendPosition + charaChunk.length,
      );

      return new Blob([newPngData], { type: "image/png" });
    } catch (error) {
      // Fallback to the old method if injection fails
      // This is normal for images converted from JPEG or created from canvas
      const imageData = await this.blobToImageData(pngBlob);
      return await this.createPNGWithMetadata(imageData, base64Json);
    }
  }

  // Remove existing metadata chunks to prevent duplicates
  removeExistingCharaChunks(data) {
    const newData = [];
    let offset = this.PNG_SIGNATURE.length;
    let charaChunksFound = 0;
    let textChunksFound = 0;

    // Copy PNG signature
    newData.push(...data.slice(0, this.PNG_SIGNATURE.length));

    while (offset < data.length - 12) {
      if (offset + 8 > data.length) {
        break;
      }

      // Read chunk length
      const length =
        (data[offset] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3];

      // Safety check to prevent infinite loops and malformed chunks
      if (length < 0 || offset + 12 + length > data.length) {
        console.warn(
          "Encountered malformed PNG chunk while cleaning metadata.",
        );
        break;
      }

      // Read chunk type
      const type = String.fromCharCode(
        data[offset + 4],
        data[offset + 5],
        data[offset + 6],
        data[offset + 7],
      );

      const chunkSize = 4 + 4 + length + 4; // length + type + data + CRC

      // Skip ALL tEXt chunks (which includes chara) to prevent any metadata conflicts
      if (type !== "tEXt" && type !== "chara") {
        newData.push(...data.slice(offset, offset + chunkSize));
      } else {
        if (type === "chara") {
          charaChunksFound++;
        } else if (type === "tEXt") {
          textChunksFound++;
        }
      }

      // Move to next chunk
      offset += chunkSize;
    }

    return new Uint8Array(newData);
  }

  // Find the position of the IEND chunk
  findIENDPosition(data) {
    let offset = this.PNG_SIGNATURE.length;

    while (offset < data.length - 12) {
      // Read chunk length
      const length =
        (data[offset] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3];

      // Read chunk type
      const type = String.fromCharCode(
        data[offset + 4],
        data[offset + 5],
        data[offset + 6],
        data[offset + 7],
      );

      if (type === "IEND") {
        return offset;
      }

      // Move to next chunk (4 bytes length + 4 bytes type + data + 4 bytes CRC)
      offset += 4 + 4 + length + 4;
    }

    return -1;
  }

  // Convert blob to ImageData
  async blobToImageData(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          canvas.width = img.width;
          canvas.height = img.height;

          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);

          resolve({
            data: imageData.data,
            width: canvas.width,
            height: canvas.height,
          });
        } catch (error) {
          URL.revokeObjectURL(url);
          console.error("Error in blobToImageData:", error);
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        console.error("Failed to load image from blob");
        reject(new Error("Failed to load image"));
      };

      img.src = url;
    });
  }

  // Create PNG with metadata chunks
  async createPNGWithMetadata(imageData, base64Json) {
    const chunks = [];

    // IHDR chunk (image header)
    const ihdrData = this.createIHDRChunk(imageData.width, imageData.height);
    chunks.push(ihdrData);

    // IDAT chunks (image data)
    const idatChunks = await this.createIDATChunks(imageData);
    chunks.push(...idatChunks);

    // Character data chunk (SillyTavern standard) - lowercase 'chara' like Python version
    const charaData = this.createtEXtChunk("chara", base64Json);
    chunks.push(charaData);

    // IEND chunk (image end)
    const iendData = this.createIENDChunk();
    chunks.push(iendData);

    // Combine all chunks
    const pngData = this.combinePNGChunks(chunks);

    return new Blob([pngData], { type: "image/png" });
  }

  // Create IHDR chunk
  createIHDRChunk(width, height) {
    const data = new Uint8Array(13);

    // Width (4 bytes, big endian)
    data[0] = (width >>> 24) & 0xff;
    data[1] = (width >>> 16) & 0xff;
    data[2] = (width >>> 8) & 0xff;
    data[3] = width & 0xff;

    // Height (4 bytes, big endian)
    data[4] = (height >>> 24) & 0xff;
    data[5] = (height >>> 16) & 0xff;
    data[6] = (height >>> 8) & 0xff;
    data[7] = height & 0xff;

    // Bit depth (1 byte)
    data[8] = 8; // 8 bits per sample

    // Color type (1 byte) - 2 = RGB, 6 = RGBA
    data[9] = 6; // RGBA

    // Compression method (1 byte)
    data[10] = 0; // Deflate

    // Filter method (1 byte)
    data[11] = 0; // Adaptive filtering

    // Interlace method (1 byte)
    data[12] = 0; // No interlace

    return this.createPNGChunk("IHDR", data);
  }

  // Create IDAT chunks (compressed image data)
  async createIDATChunks(imageData) {
    // Convert RGBA to PNG format
    const pngData = this.convertRGBAToPNG(imageData);

    // Compress data properly
    const compressed = await this.compressData(pngData);

    // Split into chunks if necessary (PNG has a 2^31 byte limit per chunk)
    const maxChunkSize = 1024 * 1024; // 1MB chunks
    const chunks = [];

    for (let i = 0; i < compressed.length; i += maxChunkSize) {
      const chunkData = compressed.slice(i, i + maxChunkSize);
      chunks.push(this.createPNGChunk("IDAT", chunkData));
    }

    return chunks;
  }

  // Convert RGBA to PNG scanline format
  convertRGBAToPNG(imageData) {
    const { data, width, height } = imageData;
    const pngData = new Uint8Array(width * height * 4 + height);
    let pngIndex = 0;

    for (let y = 0; y < height; y++) {
      // Add filter type byte (0 = None)
      pngData[pngIndex++] = 0;

      // Add scanline data
      for (let x = 0; x < width; x++) {
        const srcIndex = (y * width + x) * 4;
        pngData[pngIndex++] = data[srcIndex]; // R
        pngData[pngIndex++] = data[srcIndex + 1]; // G
        pngData[pngIndex++] = data[srcIndex + 2]; // B
        pngData[pngIndex++] = data[srcIndex + 3]; // A
      }
    }

    return pngData;
  }

  // Create text chunk for metadata (returns raw chunk with length and CRC)
  createtEXtChunk(keyword, text) {
    const keywordBytes = new TextEncoder().encode(keyword);
    const textBytes = new TextEncoder().encode(text);

    // Combine keyword and text with null separator
    const data = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
    data.set(keywordBytes, 0);
    data[keywordBytes.length] = 0; // Null separator
    data.set(textBytes, keywordBytes.length + 1);

    return this.createPNGChunk("tEXt", data);
  }

  // Create IEND chunk
  createIENDChunk() {
    return this.createPNGChunk("IEND", new Uint8Array(0));
  }

  // Create a PNG chunk with CRC
  createPNGChunk(type, data) {
    const typeBytes = new TextEncoder().encode(type);

    // Create chunk data: type + data
    const chunkData = new Uint8Array(typeBytes.length + data.length);
    chunkData.set(typeBytes, 0);
    chunkData.set(data, typeBytes.length);

    // Calculate CRC
    const crc = this.calculateCRC(chunkData);

    // Create complete chunk: length + data + CRC
    const length = data.length;
    const chunk = new Uint8Array(4 + chunkData.length + 4);

    // Length (big endian)
    chunk[0] = (length >>> 24) & 0xff;
    chunk[1] = (length >>> 16) & 0xff;
    chunk[2] = (length >>> 8) & 0xff;
    chunk[3] = length & 0xff;

    // Chunk data
    chunk.set(chunkData, 4);

    // CRC (big endian)
    const crcIndex = 4 + chunkData.length;
    chunk[crcIndex] = (crc >>> 24) & 0xff;
    chunk[crcIndex + 1] = (crc >>> 16) & 0xff;
    chunk[crcIndex + 2] = (crc >>> 8) & 0xff;
    chunk[crcIndex + 3] = crc & 0xff;

    return chunk;
  }

  // Calculate CRC for PNG chunk
  calculateCRC(data) {
    let crc = 0xffffffff;

    for (let i = 0; i < data.length; i++) {
      crc = crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  // Combine all PNG chunks into final file
  combinePNGChunks(chunks) {
    // Calculate total size
    let totalSize = this.PNG_SIGNATURE.length;
    chunks.forEach((chunk) => {
      totalSize += chunk.length;
    });

    // Create final PNG
    const pngData = new Uint8Array(totalSize);
    let offset = 0;

    // Add signature
    pngData.set(this.PNG_SIGNATURE, offset);
    offset += this.PNG_SIGNATURE.length;

    // Add all chunks
    chunks.forEach((chunk) => {
      pngData.set(chunk, offset);
      offset += chunk.length;
    });

    return pngData;
  }

  // Compress data using browser's deflate API
  async compressData(data) {
    try {
      // Use CompressionStream for proper deflate compression
      const compressionStream = new CompressionStream("deflate");
      const writer = compressionStream.writable.getWriter();
      const reader = compressionStream.readable.getReader();

      // Write data to compressor
      writer.write(data);
      writer.close();

      // Read compressed data
      const chunks = [];
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks.push(value);
        }
      }

      // Combine all chunks
      let totalLength = 0;
      chunks.forEach((chunk) => (totalLength += chunk.length));

      const result = new Uint8Array(totalLength);
      let offset = 0;
      chunks.forEach((chunk) => {
        result.set(chunk, offset);
        offset += chunk.length;
      });

      return result;
    } catch (error) {
      console.warn("Compression failed, using uncompressed data:", error);
      return new Uint8Array(data);
    }
  }

  // Analyze PNG chunks for debugging
  async analyzePNGChunks(pngBlob) {
    try {
      const arrayBuffer = await pngBlob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      if (!this.verifyPNGSignature(data)) {
        return;
      }

      let offset = this.PNG_SIGNATURE.length;
      let chunkCount = 0;
      let charaChunks = [];

      while (offset < data.length - 12) {
        const length =
          (data[offset] << 24) |
          (data[offset + 1] << 16) |
          (data[offset + 2] << 8) |
          data[offset + 3];
        const type = String.fromCharCode(
          data[offset + 4],
          data[offset + 5],
          data[offset + 6],
          data[offset + 7],
        );

        chunkCount++;

        if (type === "chara") {
          const chunkData = data.slice(offset + 8, offset + 8 + length);
          const text = new TextDecoder().decode(chunkData);
          charaChunks.push({ offset, length, text });
        } else if (type === "tEXt") {
          const chunkData = data.slice(offset + 8, offset + 8 + length);
          const text = new TextDecoder().decode(chunkData);
          // Check if this tEXt chunk contains chara data (starts with "chara\0")
          if (text.startsWith("chara\0")) {
            const charaData = text.substring(6); // Remove "chara\0" prefix
            charaChunks.push({ offset, length, text: charaData });
          }
        }

        if (type === "IEND") {
          break;
        }

        // Safety check to prevent infinite loops
        if (length < 0 || length > data.length - offset - 12) {
          break;
        }

        offset += 4 + 4 + length + 4; // length + type + data + CRC
      }

      return { chunkCount, charaChunks };
    } catch (error) {
      // Silently handle analysis errors
    }
  }

  // Download the character card
  downloadCharacterCard(blob, characterName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${characterName.replace(/[^a-zA-Z0-9\s]/g, "").trim() || "character"}_card.png`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  // Extract character data from existing PNG
  async extractCharacterData(pngBlob) {
    try {
      const arrayBuffer = await pngBlob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      // Verify PNG signature
      if (!this.verifyPNGSignature(data)) {
        throw new Error("Invalid PNG file");
      }

      // Parse chunks
      const chunks = this.parsePNGChunks(data);

      // Find text chunks
      for (const chunk of chunks) {
        if (chunk.type === "tEXt") {
          const textData = this.parsetEXtChunk(chunk.data);
          // Check for both lowercase and uppercase variants
          if (textData.keyword === "chara" || textData.keyword === "Chara") {
            try {
              // Decode base64 if needed
              let jsonText = textData.text;
              try {
                // Try to decode as base64
                jsonText = this.decodeBase64Utf8(textData.text);
              } catch (e) {
                // If base64 decode fails, assume it's already plain text
                console.log("Not base64 encoded, using as-is");
              }
              return JSON.parse(jsonText);
            } catch (error) {
              console.warn("Failed to parse character JSON:", error);
            }
          }
        }
      }

      throw new Error("No character data found in PNG");
    } catch (error) {
      console.error("Error extracting character data:", error);
      throw error;
    }
  }

  verifyPNGSignature(data) {
    if (data.length < this.PNG_SIGNATURE.length) return false;

    for (let i = 0; i < this.PNG_SIGNATURE.length; i++) {
      if (data[i] !== this.PNG_SIGNATURE[i]) return false;
    }

    return true;
  }

  parsePNGChunks(data) {
    const chunks = [];
    let offset = this.PNG_SIGNATURE.length;

    while (offset < data.length) {
      // Read chunk length
      const length =
        (data[offset] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3];
      offset += 4;

      // Read chunk type
      const type = String.fromCharCode(...data.slice(offset, offset + 4));
      offset += 4;

      // Read chunk data
      const chunkData = data.slice(offset, offset + length);
      offset += length;

      // Skip CRC
      offset += 4;

      chunks.push({
        type,
        data: chunkData,
        length,
      });

      // Break if IEND chunk
      if (type === "IEND") break;
    }

    return chunks;
  }

  parsetEXtChunk(data) {
    const nullIndex = data.indexOf(0);
    const keyword = new TextDecoder().decode(data.slice(0, nullIndex));
    const text = new TextDecoder().decode(data.slice(nullIndex + 1));

    return { keyword, text };
  }

  decodeBase64Utf8(base64Text) {
    const binary = atob(base64Text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  }
}

// CRC32 lookup table (standard PNG)
const crc32Table = (() => {
  const table = new Array(256);

  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }

  return table;
})();

// Export singleton instance
window.pngEncoder = new PNGEncoder();
