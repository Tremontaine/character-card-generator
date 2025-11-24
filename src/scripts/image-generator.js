// Image Generator Module
class ImageGenerator {
  constructor() {
    this.apiHandler = null; // Will be set lazily
    this.generatedImageUrl = "";
    this.config = window.config;
  }

  // Lazy getter for apiHandler to avoid circular dependency
  get apiHandlerInstance() {
    if (!this.apiHandler) {
      this.apiHandler = window.apiHandler;
    }
    return this.apiHandler;
  }

  async generateCharacterImage(
    characterDescription,
    characterName,
    customPrompt = null,
  ) {
    try {
      this.generatedImageUrl = await this.apiHandlerInstance.generateImage(
        characterDescription,
        characterName,
        customPrompt,
      );
      return this.generatedImageUrl;
    } catch (error) {
      console.error("Error generating image:", error);
      throw error;
    }
  }

  async downloadImage(imageUrl) {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      return await response.blob();
    } catch (error) {
      console.error("Error downloading image:", error);
      throw error;
    }
  }

  async convertToBlob(imageUrl) {
    // Handle case where imageUrl might be an object with url property
    let actualUrl = imageUrl;
    if (typeof imageUrl === "object" && imageUrl.url) {
      actualUrl = imageUrl.url;
    }

    // For blob URLs, fetch directly and return the blob to avoid canvas taint issues
    if (actualUrl.startsWith("blob:")) {
      console.log("🔄 Processing blob URL directly...");
      try {
        const response = await fetch(actualUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch blob: ${response.statusText}`);
        }
        const blob = await response.blob();
        console.log("✅ Successfully converted blob URL to blob");
        return blob;
      } catch (error) {
        console.error("❌ Failed to process blob URL:", error);
        throw error;
      }
    }

    // For data URLs, convert directly to blob
    if (actualUrl.startsWith("data:")) {
      console.log("🔄 Processing data URL...");
      try {
        const response = await fetch(actualUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch data URL: ${response.statusText}`);
        }
        const blob = await response.blob();
        console.log("✅ Successfully converted data URL to blob");
        return blob;
      } catch (error) {
        console.error("❌ Failed to process data URL:", error);
        throw error;
      }
    }

    // For remote URLs, use the proxy endpoint to avoid CORS issues
    console.log("🔄 Fetching remote URL via proxy to avoid CORS...");
    try {
      // Detect if we're running locally or in Docker
      const isLocalDev = window.location.port === "2427";
      const baseUrl = isLocalDev ? "http://localhost:2426" : "";
      const proxyUrl = `${baseUrl}/api/proxy-image?url=${encodeURIComponent(actualUrl)}`;

      const response = await fetch(proxyUrl);
      if (response.ok) {
        const blob = await response.blob();
        console.log("✅ Successfully fetched remote URL via proxy");
        return blob;
      }
      console.warn("⚠️ Proxy fetch failed, falling back to canvas conversion");
    } catch (error) {
      console.warn(
        "⚠️ Proxy fetch failed, falling back to canvas conversion:",
        error.message,
      );
    }

    // Fallback to canvas conversion if direct fetch fails
    return new Promise((resolve, reject) => {
      const img = new Image();

      // Add cache-busting parameters
      img.crossOrigin = "anonymous";
      const cacheBuster = `_cb=${Date.now()}_${Math.random()}`;
      const srcUrl = actualUrl.includes("?")
        ? `${actualUrl}&${cacheBuster}`
        : `${actualUrl}?${cacheBuster}`;

      this.loadImageFromUrl(srcUrl, resolve, reject);
    });
  }

  // Helper method to load image from URL and convert to blob
  loadImageFromUrl(imageUrl, resolve, reject, cleanupCallback = null) {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw image to canvas
      ctx.drawImage(img, 0, 0);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (cleanupCallback) cleanupCallback();
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to convert image to blob"));
          }
        },
        "image/png",
        0.95,
      );
    };

    img.onerror = (error) => {
      if (cleanupCallback) cleanupCallback();
      reject(new Error("Failed to load image"));
    };

    img.src = imageUrl;
  }

  formatImageForDisplay(imageUrl) {
    return `
            <div class="image-container">
                <img src="${imageUrl}" alt="${this.characterName || "Generated character"}" class="generated-image">
            </div>
        `;
  }

  async optimizeImageForCard(imageBlob) {
    // Return the original image blob without any resizing
    return imageBlob;
  }

  displayLoadingState(container) {
    container.innerHTML = `
            <div class="image-placeholder">
                <div class="loading-spinner"></div>
                <p style="margin-top: 1rem; color: var(--text-secondary);">Generating image...</p>
            </div>
        `;
  }

  displayErrorState(container, error) {
    container.innerHTML = `
            <div class="image-error" style="text-align: center; padding: 2rem;">
                <div style="color: var(--error); font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
                <h3 style="color: var(--error); margin-bottom: 0.5rem;">Image Generation Failed</h3>
                <p style="color: var(--text-secondary);">${error.message}</p>
                <button onclick="this.parentElement.parentElement.innerHTML = ''" class="btn-outline" style="margin-top: 1rem;">
                    Clear
                </button>
            </div>
        `;
  }

  async generateAndDisplayImage(
    characterDescription,
    characterName,
    container,
    customPrompt = null,
  ) {
    this.displayLoadingState(container);

    try {
      const imageUrl = await this.generateCharacterImage(
        characterDescription,
        characterName,
        customPrompt,
      );

      // Convert remote URL to blob URL immediately to avoid CORS issues later
      let displayUrl = imageUrl;
      let shouldCleanupBlob = false;

      if (
        imageUrl &&
        !imageUrl.startsWith("blob:") &&
        !imageUrl.startsWith("data:")
      ) {
        console.log(
          "🔄 Converting remote image URL to blob URL via proxy for CORS safety",
        );
        try {
          // Detect if we're running locally or in Docker
          const isLocalDev = window.location.port === "2427";
          const baseUrl = isLocalDev ? "http://localhost:2426" : "";
          const proxyUrl = `${baseUrl}/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;

          const response = await fetch(proxyUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
          }
          const blob = await response.blob();
          displayUrl = URL.createObjectURL(blob);
          shouldCleanupBlob = true;
          console.log("✅ Successfully converted remote URL to blob URL via proxy");
        } catch (error) {
          console.warn(
            "⚠️ Could not convert remote URL to blob via proxy, using original:",
            error.message,
          );
          // Fall back to original URL if blob conversion fails
        }
      }

      // Create image element and wait for it to load
      const img = document.createElement("img");

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = (error) => {
          // Clean up blob URL if image loading fails
          if (shouldCleanupBlob) {
            console.log(
              "🗑️ Cleaning up blob URL due to load error:",
              displayUrl,
            );
            URL.revokeObjectURL(displayUrl);
          }
          reject(error);
        };
        img.src = displayUrl;
      });

      // Display the image
      container.innerHTML = this.formatImageForDisplay(displayUrl);

      // Return the display URL and cleanup info
      return { url: displayUrl, shouldCleanup: shouldCleanupBlob };
    } catch (error) {
      this.displayErrorState(container, error);
      throw error;
    }
  }

  getImageStats(imageBlob) {
    return {
      size: imageBlob.size,
      sizeFormatted: this.formatFileSize(imageBlob.size),
      type: imageBlob.type,
    };
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  validateImageFile(file) {
    // Check if file is an image
    if (!file.type.startsWith("image/")) {
      throw new Error("File must be an image");
    }

    // Check file size (max 10MB for most APIs)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error("Image file too large. Maximum size is 10MB.");
    }

    // Check supported formats
    const supportedFormats = ["image/jpeg", "image/png", "image/webp"];
    if (!supportedFormats.includes(file.type)) {
      throw new Error(
        "Unsupported image format. Please use JPEG, PNG, or WebP.",
      );
    }

    return true;
  }
}

// Export singleton instance
window.imageGenerator = new ImageGenerator();
