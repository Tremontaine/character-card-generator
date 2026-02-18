// Main Application Controller
class CharacterGeneratorApp {
  constructor() {
    this.characterGenerator = window.characterGenerator;
    this.imageGenerator = window.imageGenerator;
    this.pngEncoder = window.pngEncoder;
    this.config = window.config;
    this.apiHandler = window.apiHandler;
    this.storage = window.characterStorage;
    this.storageReady = false;

    this.currentCharacter = null;
    this.originalCharacter = null; // Store the original AI-generated version
    this.currentImageUrl = null;
    this.lorebookData = null; // Store loaded lorebook data
    this.referenceImageDataUrl = "";
    // Removed currentImageBlob - we now convert fresh from URL on download
    this.isGenerating = false;

    this.init();
  }

  async init() {
    const savedConfig = localStorage.getItem("charGeneratorConfig");
    if (
      savedConfig &&
      (savedConfig.includes('"api":{"baseUrl"') ||
        savedConfig.includes('"textModel"'))
    ) {
      localStorage.removeItem("charGeneratorConfig");
    }

    await this.config.waitForConfig();
    await this.ensureStorageReady();
    this.config.saveToForm();
    this.bindEvents();
    this.checkAPIStatus();
    this.refreshLibraryViews();
  }

  async ensureStorageReady() {
    if (!this.storage) {
      this.storageReady = false;
      this.updateLibraryStatus("Local library unavailable in this session.");
      return;
    }

    try {
      await this.storage.init();
      this.storageReady = true;
      this.updateLibraryStatus("Local library ready.");
    } catch (error) {
      console.error("Failed to initialize IndexedDB:", error);
      this.storageReady = false;
      this.updateLibraryStatus(
        "IndexedDB failed to initialize. Prompt/card saving is disabled.",
      );
    }
  }

  bindEvents() {
    // Generate button
    const generateBtn = document.getElementById("generate-btn");
    generateBtn.addEventListener("click", () => this.handleGenerate());

    // Stop button
    const stopBtn = document.getElementById("stop-btn");
    stopBtn.addEventListener("click", () => this.handleStop());

    // Download button
    const downloadBtn = document.getElementById("download-btn");
    downloadBtn.addEventListener("click", () => this.handleDownload());

    // Download JSON button
    const downloadJsonBtn = document.getElementById("download-json-btn");
    downloadJsonBtn.addEventListener("click", () => this.handleDownloadJSON());

    // Regenerate button
    const regenerateBtn = document.getElementById("regenerate-btn");
    regenerateBtn.addEventListener("click", () => this.handleRegenerate());

    // Import card button
    const importCardBtn = document.getElementById("import-card-btn");
    const importCardTopBtn = document.getElementById("import-card-top-btn");
    const importCardInput = document.getElementById("import-card-input");
    const importCardTopInput = document.getElementById("import-card-top-input");
    if (importCardInput || importCardTopInput) {
      if (importCardBtn) {
        importCardBtn.addEventListener("click", () =>
          (importCardInput || importCardTopInput).click(),
        );
      }
      if (importCardTopBtn) {
        importCardTopBtn.addEventListener("click", () =>
          (importCardTopInput || importCardInput).click(),
        );
      }
      if (importCardInput) {
        importCardInput.addEventListener("change", (e) =>
          this.handleImportCard(e),
        );
      }
      if (importCardTopInput) {
        importCardTopInput.addEventListener("change", (e) =>
          this.handleImportCard(e),
        );
      }
    }

    // Revision button
    const reviseCharacterBtn = document.getElementById("revise-character-btn");
    if (reviseCharacterBtn) {
      reviseCharacterBtn.addEventListener("click", () =>
        this.handleReviseCharacter(),
      );
    }

    // Regenerate image button
    const regenerateImageBtn = document.getElementById("regenerate-image-btn");
    regenerateImageBtn.addEventListener("click", () =>
      this.handleRegenerateImage(),
    );

    // Regenerate prompt button
    const regeneratePromptBtn = document.getElementById(
      "regenerate-prompt-btn",
    );
    regeneratePromptBtn.addEventListener("click", () =>
      this.handleRegeneratePrompt(),
    );

    // Character field reset buttons
    const resetDescriptionBtn = document.getElementById(
      "reset-description-btn",
    );
    const resetPersonalityBtn = document.getElementById(
      "reset-personality-btn",
    );
    const resetScenarioBtn = document.getElementById("reset-scenario-btn");
    const resetFirstMessageBtn = document.getElementById(
      "reset-first-message-btn",
    );

    resetDescriptionBtn.addEventListener("click", () =>
      this.handleResetField("description"),
    );
    resetPersonalityBtn.addEventListener("click", () =>
      this.handleResetField("personality"),
    );
    resetScenarioBtn.addEventListener("click", () =>
      this.handleResetField("scenario"),
    );
    resetFirstMessageBtn.addEventListener("click", () =>
      this.handleResetField("firstMessage"),
    );

    // Character field textareas - show reset button when edited
    const descriptionTextarea = document.getElementById(
      "character-description",
    );
    const personalityTextarea = document.getElementById(
      "character-personality",
    );
    const scenarioTextarea = document.getElementById("character-scenario");
    const firstMessageTextarea = document.getElementById(
      "character-first-message",
    );

    descriptionTextarea.addEventListener("input", () =>
      this.handleCharacterEdit("description"),
    );
    personalityTextarea.addEventListener("input", () =>
      this.handleCharacterEdit("personality"),
    );
    scenarioTextarea.addEventListener("input", () =>
      this.handleCharacterEdit("scenario"),
    );
    firstMessageTextarea.addEventListener("input", () =>
      this.handleCharacterEdit("firstMessage"),
    );

    // Upload image button
    const uploadImageBtn = document.getElementById("upload-image-btn");
    uploadImageBtn.addEventListener("click", () => {
      document.getElementById("image-upload-input").click();
    });

    // Image upload input
    const imageUploadInput = document.getElementById("image-upload-input");
    imageUploadInput.addEventListener("change", (e) =>
      this.handleImageUpload(e),
    );

    // Lorebook upload input
    const lorebookInput = document.getElementById("lorebook-file");
    lorebookInput.addEventListener("change", (e) =>
      this.handleLorebookUpload(e),
    );

    // Reference image upload input
    const referenceImageInput = document.getElementById("reference-image-file");
    if (referenceImageInput) {
      referenceImageInput.addEventListener("change", (e) =>
        this.handleReferenceImageUpload(e),
      );
    }

    // Debug mode toggle
    const debugModeCheckbox = document.getElementById("debug-mode");
    if (debugModeCheckbox) {
      // Load saved debug mode state
      debugModeCheckbox.checked = this.config.getDebugMode();

      // Handle toggle
      debugModeCheckbox.addEventListener("change", (e) => {
        this.config.setDebugMode(e.target.checked);
      });
    }

    // API status click to reconfigure
    const apiStatus = document.getElementById("api-status");
    apiStatus.addEventListener("click", () => this.handleAPIConfig());
    apiStatus.style.cursor = "pointer";

    // Save API settings on input change
    const apiInputs = document.querySelectorAll(
      "#text-api-base, #text-api-key, #text-model, #vision-model, #image-api-base, #image-api-key, #image-model",
    );
    apiInputs.forEach((input) => {
      input.addEventListener("change", () => this.saveAPISettings());
    });

    // Clear config button
    const clearConfigBtn = document.getElementById("clear-config-btn");
    clearConfigBtn.addEventListener("click", () => this.handleClearConfig());

    // Test connection button
    const testConnectionBtn = document.getElementById("test-connection-btn");
    testConnectionBtn.addEventListener("click", () =>
      this.handleTestConnection(),
    );

    // Enter key in textarea
    const conceptTextarea = document.getElementById("character-concept");
    conceptTextarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        this.handleGenerate();
      }
    });

    // API key persistence toggle
    const persistApiKeysToggle = document.getElementById("persist-api-keys");
    if (persistApiKeysToggle) {
      persistApiKeysToggle.addEventListener("change", (e) => {
        this.config.loadFromForm(); // Update config with new toggle state
        this.config.saveConfig(); // Save the change
        console.log(
          `🔑 API key persistence ${e.target.checked ? "enabled" : "disabled"}`,
        );
      });
    }

    // Image generation toggle
    const enableImageGenerationToggle = document.getElementById(
      "enable-image-generation",
    );
    if (enableImageGenerationToggle) {
      enableImageGenerationToggle.addEventListener("change", (e) => {
        this.config.loadFromForm(); // Update config with new toggle state
        this.config.saveConfig(); // Save the change
        console.log(
          `🖼️ Image generation ${e.target.checked ? "enabled" : "disabled"}`,
        );
      });
    }

    // API Settings Modal functionality
    const apiSettingsBtn = document.getElementById("api-settings-btn");
    const modalOverlay = document.getElementById("api-settings-modal");
    const modalCloseBtn = document.getElementById("modal-close-btn");

    // Open modal
    apiSettingsBtn.addEventListener("click", () => {
      modalOverlay.classList.add("show");
      document.body.style.overflow = "hidden"; // Prevent background scrolling
    });

    // Close modal function
    const closeModal = () => {
      modalOverlay.classList.remove("show");
      document.body.style.overflow = ""; // Restore scrolling
    };

    // Close modal with close button
    modalCloseBtn.addEventListener("click", closeModal);

    // Close modal with escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalOverlay.classList.contains("show")) {
        closeModal();
      }
    });

    // Close modal when clicking outside the modal content
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    const promptList = document.getElementById("stored-prompts-list");
    const cardList = document.getElementById("stored-cards-list");

    if (promptList) {
      promptList.addEventListener("click", (event) =>
        this.handleLibraryPromptClick(event),
      );
    }

    if (cardList) {
      cardList.addEventListener("click", (event) =>
        this.handleLibraryCardClick(event),
      );
    }

    // Example messages generator buttons
    const generateExamplesBtn = document.getElementById(
      "generate-examples-btn",
    );
    const copyExamplesBtn = document.getElementById("copy-examples-btn");

    if (generateExamplesBtn) {
      generateExamplesBtn.addEventListener("click", () =>
        this.handleGenerateExampleMessages(),
      );
    }

    if (copyExamplesBtn) {
      copyExamplesBtn.addEventListener("click", () =>
        this.handleCopyExampleMessages(),
      );
    }
  }

  async checkAPIStatus() {
    const statusElement = document.getElementById("api-status");
    const indicator = statusElement.querySelector(".status-indicator");
    const text = statusElement.querySelector(".status-text");

    try {
      const result = await this.apiHandler.testConnection();
      if (result.success) {
        indicator.className = "status-indicator status-online";
        text.textContent = "API Status: Connected";
      } else {
        indicator.className = "status-indicator status-offline";
        text.textContent = `API Status: ${result.error}`;
      }
    } catch (error) {
      indicator.className = "status-indicator status-offline";
      text.textContent = `API Status: ${error.message}`;
    }
  }

  saveAPISettings() {
    this.config.loadFromForm();
    this.config.saveConfig();
    this.checkAPIStatus();
  }

  async handleAPIConfig() {
    this.showNotification("Configure API settings in form above", "info");
  }

  handleClearConfig() {
    if (confirm("Are you sure you want to clear all saved API settings?")) {
      this.config.clearStoredConfig();
      this.showNotification(
        "Configuration cleared! Reloading page...",
        "success",
      );
      // Reload page to reset everything to defaults
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }

  async handleTestConnection() {
    this.showNotification("Testing connection...", "info");

    try {
      // Save current settings first
      this.saveAPISettings();

      // Test connection
      const result = await this.apiHandler.testConnection();

      if (result.success) {
        if (result.authMethod === "alternative") {
          this.showNotification(
            "Connection successful with alternative auth method! Check console for details.",
            "success",
          );
        } else {
          this.showNotification("Connection successful!", "success");
        }
      } else {
        if (
          result.error.includes("401") ||
          result.error.includes("Authorization")
        ) {
          this.showNotification(
            "Authorization failed! Possible issues: 1) API key expired/invalid 2) Wrong auth format - trying alternatives 3) Check API key and try again",
            "error",
          );
        } else {
          this.showNotification(`Connection failed: ${result.error}`, "error");
        }
      }
    } catch (error) {
      this.showNotification(
        `Connection test failed: ${error.message}`,
        "error",
      );
    }
  }

  async handleGenerate() {
    if (this.isGenerating) return;

    // Save current API settings
    this.saveAPISettings();

    // Validate configuration
    const errors = this.config.validateConfig();
    if (errors.length > 0) {
      this.showNotification(
        `Configuration errors: ${errors.join(", ")}`,
        "error",
      );
      return;
    }

    const concept = document.getElementById("character-concept").value.trim();
    const characterName = document
      .getElementById("character-name")
      .value.trim();
    const referenceImageDescription = document
      .getElementById("reference-image-description")
      ?.value?.trim();

    if (!concept) {
      this.showNotification("Please enter a character concept", "warning");
      return;
    }

    this.isGenerating = true;
    this.setGeneratingState(true);
    this.clearStream();

    try {
      // Show stream section
      const streamSection = document.querySelector(".stream-section");
      streamSection.style.display = "block";

      const pov = document.getElementById("pov-select").value;
      let effectiveConcept = concept;

      if (referenceImageDescription) {
        effectiveConcept += `\n\nReference appearance guidance:\n${referenceImageDescription}`;
      }

      const promptSaved = await this.savePromptToLibrary({
        concept,
        characterName,
        pov,
        lorebookData: this.lorebookData,
        referenceImageDescription: referenceImageDescription || "",
        referenceImageDataUrl: this.referenceImageDataUrl || "",
      });
      await this.refreshLibraryViews();
      if (!promptSaved) {
        this.showStreamMessage(
          "⚠️ Prompt could not be saved to local library.\n",
        );
      }

      // Generate character data with streaming
      this.showStreamMessage("🚀 Starting character generation...\n\n");
      this.currentCharacter = await this.characterGenerator.generateCharacter(
        effectiveConcept,
        characterName,
        (token, fullContent) => this.handleCharacterStream(token, fullContent),
        pov,
        this.lorebookData,
      );

      // Store original for reset functionality
      this.originalCharacter = JSON.parse(
        JSON.stringify(this.currentCharacter),
      );
      await this.saveCardToLibrary();
      await this.refreshLibraryViews();

      this.showStreamMessage("\n\n✅ Character generation complete!\n");

      // Display character
      this.displayCharacter();

      // Check if image generation is configured and enabled
      const imageApiBase = this.config.get("api.image.baseUrl");
      const imageApiKey = this.config.get("api.image.apiKey");
      const enableImageGeneration = this.config.get(
        "app.enableImageGeneration",
      );
      const hasReferenceImage = !!this.referenceImageDataUrl;

      if (hasReferenceImage) {
        this.currentImageUrl = this.referenceImageDataUrl;
        const imageContainer = document.getElementById("image-content");
        imageContainer.innerHTML = `
          <div class="image-container">
            <img src="${this.currentImageUrl}" alt="${this.currentCharacter.name || "Reference image"}" class="generated-image">
          </div>
        `;
        this.showStreamMessage(
          "🖼️ Using uploaded reference image as final card image (skipped image API generation)\n",
        );
      } else if (imageApiBase && imageApiKey && enableImageGeneration) {
        // Generate image with error handling
        try {
          this.showStreamMessage("🎨 Generating character image...\n");
          await this.generateImage();
          this.showStreamMessage("✅ Image generation complete!\n");
        } catch (imageError) {
          console.error("Image generation error:", imageError);
          this.showStreamMessage(
            `⚠️ Image generation failed: ${imageError.message}\n`,
          );
          this.showStreamMessage("📝 Continuing with character data only...\n");
          // Show placeholder with upload option
          const imageContainer = document.getElementById("image-content");
          imageContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
              <p>Image generation failed</p>
              <p style="font-size: 0.875rem; margin-top: 0.5rem; color: var(--error);">${imageError.message}</p>
              <p style="font-size: 0.875rem; margin-top: 0.5rem;">You can upload your own image</p>
            </div>
          `;
        }
      } else {
        this.showStreamMessage(
          "⏭️ Skipping image generation (image generation disabled or no API configured)\n",
        );
        // Show placeholder with upload option when image generation is disabled
        const imageContainer = document.getElementById("image-content");
        imageContainer.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
            <div style="font-size: 2rem; margin-bottom: 1rem;">🖼️</div>
            <p style="font-weight: 500; margin-bottom: 0.5rem;">Image Generation Disabled</p>
            <p style="font-size: 0.875rem; margin-bottom: 1rem;">Enable image generation in settings or upload your own image</p>
            <button onclick="document.getElementById('upload-image-btn').click()" style="padding: 0.5rem 1rem; background: var(--accent); color: white; border: none; border-radius: 0.375rem; cursor: pointer;">
              📁 Upload Image
            </button>
          </div>
        `;
      }

      // Show result section and image controls
      this.showResultSection();
      document.getElementById("image-controls").style.display = "block";

      // Always show prompt editor when image API is configured (regardless of generation setting)
      if (imageApiBase && imageApiKey) {
        const promptEditor = document.getElementById("image-prompt-editor");
        const customPromptTextarea = document.getElementById(
          "custom-image-prompt",
        );
        const referenceDescription = document
          .getElementById("reference-image-description")
          ?.value?.trim();

        if (promptEditor) {
          promptEditor.style.display = "block";

          if (
            customPromptTextarea &&
            referenceDescription &&
            !customPromptTextarea.value.trim()
          ) {
            customPromptTextarea.value = `Character portrait of ${this.currentCharacter.name || "the character"}, based on this reference description: ${referenceDescription}. High quality, detailed features, cinematic lighting, coherent anatomy, expressive face, fitting background.`;
            window.updatePromptCharCount();
          }

          if (
            customPromptTextarea &&
            window.apiHandler.lastGeneratedImagePrompt
          ) {
            // Use the previously generated prompt
            customPromptTextarea.value =
              window.apiHandler.lastGeneratedImagePrompt;
            // Update character counter
            window.updatePromptCharCount();
          } else if (
            !hasReferenceImage &&
            customPromptTextarea &&
            !customPromptTextarea.value.trim()
          ) {
            // Generate prompt only if needed and no reference image was provided.
            try {
              const defaultPrompt = await window.apiHandler.generateImagePrompt(
                this.currentCharacter.description,
                this.currentCharacter.name,
              );
              customPromptTextarea.value = defaultPrompt;
            } catch (error) {
              console.error("Failed to generate image prompt:", error);
              // Fall back to direct prompt building
              const fallbackPrompt = window.apiHandler.buildDirectImagePrompt(
                this.currentCharacter.description,
                this.currentCharacter.name,
              );
              customPromptTextarea.value = fallbackPrompt;
            }
            window.updatePromptCharCount();
          }
        }
      }

      this.showNotification("Character generated successfully!", "success");
    } catch (error) {
      console.error("Generation error:", error);

      // Check if this was a user-initiated stop
      const wasStoppedByUser = error.message.includes(
        "Generation stopped by user",
      );

      if (wasStoppedByUser) {
        this.showStreamMessage(`\n🛑 Generation stopped.\n`);
        // Don't show error notification for user-initiated stops
      } else {
        this.showStreamMessage(`❌ Error: ${error.message}\n`);
        this.showNotification(`Generation failed: ${error.message}`, "error");
      }

      // Hide result section if generation failed
      this.hideResultSection();
    } finally {
      this.isGenerating = false;
      this.setGeneratingState(false);
    }
  }

  handleCharacterStream(token, fullContent) {
    // Append token to stream
    this.appendStreamContent(token);
  }

  showStreamMessage(message) {
    const streamContent = document.getElementById("stream-content");
    const messageElement = document.createElement("div");
    messageElement.textContent = message;
    streamContent.appendChild(messageElement);
    streamContent.scrollTop = streamContent.scrollHeight;
  }

  appendStreamContent(content) {
    const streamContent = document.getElementById("stream-content");

    // Remove placeholder if it exists
    const placeholder = streamContent.querySelector(".stream-placeholder");
    if (placeholder) {
      placeholder.remove();
    }

    // Check if last child is content container
    let contentContainer = streamContent.querySelector(".stream-content");
    if (!contentContainer) {
      contentContainer = document.createElement("div");
      contentContainer.className = "stream-content";
      streamContent.appendChild(contentContainer);
    }

    // Append new content
    contentContainer.textContent += content;
    streamContent.scrollTop = streamContent.scrollHeight;
  }

  clearStream() {
    const streamContent = document.getElementById("stream-content");
    streamContent.innerHTML =
      '<div class="stream-placeholder">Generation output will appear here...</div>';
  }

  async handleDownload() {
    if (!this.currentCharacter || !this.currentImageUrl) {
      this.showNotification("No character to download", "warning");
      return;
    }

    try {
      this.showNotification("Creating character card...", "info");

      // Get the current (possibly edited) character fields
      const descriptionTextarea = document.getElementById(
        "character-description",
      );
      const personalityTextarea = document.getElementById(
        "character-personality",
      );
      const scenarioTextarea = document.getElementById("character-scenario");
      const firstMessageTextarea = document.getElementById(
        "character-first-message",
      );

      // Update currentCharacter with edited content
      this.currentCharacter.description = descriptionTextarea.value.trim();
      this.currentCharacter.personality = personalityTextarea.value.trim();
      this.currentCharacter.scenario = scenarioTextarea.value.trim();
      this.currentCharacter.firstMessage = firstMessageTextarea.value.trim();

      // Always convert from currentImageUrl to ensure we get the latest image
      // This ensures regenerated or uploaded images are properly included

      let imageBlob = await this.imageGenerator.convertToBlob(
        this.currentImageUrl,
      );

      // Use image as-is without resizing
      imageBlob = await this.imageGenerator.optimizeImageForCard(imageBlob);

      // Convert to Spec V2 format
      const specV2Data = this.characterGenerator.toSpecV2Format(
        this.currentCharacter,
      );

      // Create character card
      const cardBlob = await this.pngEncoder.createCharacterCard(
        imageBlob,
        specV2Data,
      );
      // You can uncomment this to see a preview modal before download
      /*
      const shouldDownload = confirm(
        "PNG created! Click OK to download, or Cancel to preview in console first.\n\n" +
        "Check the browser console for preview URLs."
      );
      if (!shouldDownload) {
        this.showNotification("Download cancelled", "info");
        return;
      }
      */

      // Download
      this.pngEncoder.downloadCharacterCard(
        cardBlob,
        this.currentCharacter.name,
      );

      const finalSize = this.imageGenerator.formatFileSize(cardBlob.size);
      this.showNotification(
        `Character card downloaded! Size: ${finalSize}`,
        "success",
      );
      await this.saveCardToLibrary();
      await this.refreshLibraryViews();
    } catch (error) {
      console.error("Download error:", error);
      this.showNotification(`Download failed: ${error.message}`, "error");
    }
  }

  async handleRegeneratePrompt() {
    if (!this.currentCharacter) {
      this.showNotification("Please generate a character first", "warning");
      return;
    }

    const customPromptTextarea = document.getElementById("custom-image-prompt");
    const promptEditor = document.getElementById("image-prompt-editor");

    if (!customPromptTextarea || !promptEditor) {
      this.showNotification("Prompt editor not found", "error");
      return;
    }

    try {
      this.showNotification("Regenerating image prompt...", "info");
      // Use AI to generate a detailed natural language prompt
      const newPrompt = await window.apiHandler.generateImagePrompt(
        this.currentCharacter.description,
        this.currentCharacter.name,
      );
      customPromptTextarea.value = newPrompt;
      // Update character counter
      window.updatePromptCharCount();
      this.showNotification("Image prompt regenerated!", "success");
    } catch (error) {
      console.error("Failed to regenerate image prompt:", error);
      // Fall back to direct prompt building
      const fallbackPrompt = window.apiHandler.buildDirectImagePrompt(
        this.currentCharacter.description,
        this.currentCharacter.name,
      );
      customPromptTextarea.value = fallbackPrompt;
      window.updatePromptCharCount();
      this.showNotification("Using fallback prompt generation", "warning");
    }

    // Ensure prompt editor is visible
    promptEditor.style.display = "block";
  }

  async handleRegenerateImage() {
    if (!this.currentCharacter) {
      this.showNotification("Please generate a character first", "warning");
      return;
    }

    const imageApiBase = this.config.get("api.image.baseUrl");
    const imageApiKey = this.config.get("api.image.apiKey");

    if (!imageApiBase || !imageApiKey) {
      this.showNotification(
        "Please configure image API settings first",
        "warning",
      );
      return;
    }

    // Show the prompt editor and populate it with the default prompt
    const promptEditor = document.getElementById("image-prompt-editor");
    const customPromptTextarea = document.getElementById("custom-image-prompt");

    if (promptEditor && customPromptTextarea) {
      // Generate the default prompt if not already populated
      if (!customPromptTextarea.value.trim()) {
        try {
          this.showNotification("Generating image prompt...", "info");
          // Use AI to generate a detailed natural language prompt
          const defaultPrompt = await window.apiHandler.generateImagePrompt(
            this.currentCharacter.description,
            this.currentCharacter.name,
          );
          customPromptTextarea.value = defaultPrompt;
          // Update character counter
          window.updatePromptCharCount();
        } catch (error) {
          console.error("Failed to generate image prompt:", error);
          // Fall back to direct prompt building
          const fallbackPrompt = window.apiHandler.buildDirectImagePrompt(
            this.currentCharacter.description,
            this.currentCharacter.name,
          );
          customPromptTextarea.value = fallbackPrompt;
          // Update character counter
          window.updatePromptCharCount();
        }
      }
      promptEditor.style.display = "block";
    }

    try {
      this.showNotification("Regenerating image...", "info");
      await this.generateImage();
      this.showNotification("Image regenerated successfully!", "success");
    } catch (error) {
      console.error("Image regeneration error:", error);
      this.showNotification(
        `Image regeneration failed: ${error.message}`,
        "error",
      );
    }
  }

  async generateImage() {
    const imageContainer = document.getElementById("image-content");

    // Check if user has provided a custom prompt
    const customPromptTextarea = document.getElementById("custom-image-prompt");
    const customPrompt = customPromptTextarea?.value?.trim();
    const referenceImageDescription = document
      .getElementById("reference-image-description")
      ?.value?.trim();

    // Update character counter
    window.updatePromptCharCount();

    // Clean up previous blob URL if it exists
    if (this.currentImageUrl && this.currentImageUrl.startsWith("blob:")) {
      console.log("🗑️ Revoking previous blob URL:", this.currentImageUrl);
      URL.revokeObjectURL(this.currentImageUrl);
    }

    const imageDescriptionInput = referenceImageDescription
      ? `${this.currentCharacter.description}\n\nReference image details:\n${referenceImageDescription}`
      : this.currentCharacter.description;
    const promptFromReference = referenceImageDescription
      ? `Character portrait of ${this.currentCharacter.name || "the character"}, based on this reference description: ${referenceImageDescription}. High quality, detailed features, cinematic lighting, coherent anatomy, expressive face, fitting background.`
      : "";
    const effectivePrompt = customPrompt || promptFromReference || null;

    const imageResult = await this.imageGenerator.generateAndDisplayImage(
      imageDescriptionInput,
      this.currentCharacter.name,
      imageContainer,
      effectivePrompt,
    );

    // Extract URL from the result object
    this.currentImageUrl = imageResult.url || imageResult;

    // If no custom prompt was provided, populate textarea with auto-generated prompt
    if (
      !customPrompt &&
      customPromptTextarea &&
      window.apiHandler.lastGeneratedImagePrompt
    ) {
      customPromptTextarea.value = window.apiHandler.lastGeneratedImagePrompt;
      console.log("Updated custom prompt textarea with auto-generated prompt");
    }

    // Note: We don't store blob here anymore - download converts fresh from URL
    // This ensures regenerated images are properly included in downloads
  }

  handleResetField(field) {
    if (!this.originalCharacter) {
      this.showNotification("No original character to reset to", "warning");
      return;
    }

    let textarea, resetBtn, originalValue, fieldName;

    switch (field) {
      case "description":
        textarea = document.getElementById("character-description");
        resetBtn = document.getElementById("reset-description-btn");
        originalValue = this.originalCharacter.description;
        fieldName = "Description";
        break;
      case "personality":
        textarea = document.getElementById("character-personality");
        resetBtn = document.getElementById("reset-personality-btn");
        originalValue = this.originalCharacter.personality;
        fieldName = "Personality";
        break;
      case "scenario":
        textarea = document.getElementById("character-scenario");
        resetBtn = document.getElementById("reset-scenario-btn");
        originalValue = this.originalCharacter.scenario;
        fieldName = "Scenario";
        break;
      case "firstMessage":
        textarea = document.getElementById("character-first-message");
        resetBtn = document.getElementById("reset-first-message-btn");
        originalValue = this.originalCharacter.firstMessage;
        fieldName = "First message";
        break;
    }

    // Reset the field value
    textarea.value = originalValue || "";
    this.currentCharacter[field] = originalValue || "";

    // Hide reset button
    resetBtn.style.display = "none";

    this.showNotification(`${fieldName} reset to original`, "success");
  }

  async handleDownloadJSON() {
    if (!this.currentCharacter) {
      this.showNotification("No character to download", "warning");
      return;
    }

    try {
      this.showNotification("Preparing character JSON...", "info");

      // Get the current (possibly edited) character fields
      const descriptionTextarea = document.getElementById(
        "character-description",
      );
      const personalityTextarea = document.getElementById(
        "character-personality",
      );
      const scenarioTextarea = document.getElementById("character-scenario");
      const firstMessageTextarea = document.getElementById(
        "character-first-message",
      );

      // Update currentCharacter with edited content
      this.currentCharacter.description = descriptionTextarea.value.trim();
      this.currentCharacter.personality = personalityTextarea.value.trim();
      this.currentCharacter.scenario = scenarioTextarea.value.trim();
      this.currentCharacter.firstMessage = firstMessageTextarea.value.trim();

      // Convert to Spec V2 format
      const specV2Data = this.characterGenerator.toSpecV2Format(
        this.currentCharacter,
      );

      // Create JSON string with nice formatting
      const jsonString = JSON.stringify(specV2Data, null, 2);

      // Create blob and download
      const blob = new Blob([jsonString], { type: "application/json" });
      this.downloadBlob(
        blob,
        `${this.currentCharacter.name || "character"}_data.json`,
      );

      this.showNotification(
        "Character JSON downloaded successfully!",
        "success",
      );
      await this.saveCardToLibrary();
      await this.refreshLibraryViews();
    } catch (error) {
      console.error("Error downloading JSON:", error);
      this.showNotification("Failed to download JSON", "error");
    }
  }

  handleCharacterEdit(field) {
    if (!this.originalCharacter || !this.currentCharacter) {
      return;
    }

    let textarea, resetBtn, originalValue, currentField;

    switch (field) {
      case "description":
        textarea = document.getElementById("character-description");
        resetBtn = document.getElementById("reset-description-btn");
        originalValue = this.originalCharacter.description;
        currentField = "description";
        break;
      case "personality":
        textarea = document.getElementById("character-personality");
        resetBtn = document.getElementById("reset-personality-btn");
        originalValue = this.originalCharacter.personality;
        currentField = "personality";
        break;
      case "scenario":
        textarea = document.getElementById("character-scenario");
        resetBtn = document.getElementById("reset-scenario-btn");
        originalValue = this.originalCharacter.scenario;
        currentField = "scenario";
        break;
      case "firstMessage":
        textarea = document.getElementById("character-first-message");
        resetBtn = document.getElementById("reset-first-message-btn");
        originalValue = this.originalCharacter.firstMessage;
        currentField = "firstMessage";
        break;
    }

    // Update currentCharacter with the edited content
    this.currentCharacter[currentField] = textarea.value;

    // Show/hide reset button based on whether content has changed
    const currentContent = textarea.value.trim();
    const originalContent = (originalValue || "").trim();

    if (currentContent !== originalContent) {
      resetBtn.style.display = "block";
    } else {
      resetBtn.style.display = "none";
    }
  }

  async handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!this.currentCharacter) {
      this.showNotification("Please generate a character first", "warning");
      event.target.value = ""; // Reset input
      return;
    }

    try {
      // Validate image file
      if (!file.type.startsWith("image/")) {
        throw new Error("Please select an image file");
      }

      // Clean up previous blob URL if it exists
      if (this.currentImageUrl && this.currentImageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(this.currentImageUrl);
        console.log("🗑️ Revoked previous blob URL:", this.currentImageUrl);
      }

      // Create object URL for the uploaded image
      this.currentImageUrl = URL.createObjectURL(file);

      // Display the uploaded image
      const imageContainer = document.getElementById("image-content");
      imageContainer.innerHTML = `
        <div class="image-container">
          <img src="${this.currentImageUrl}" alt="${this.currentCharacter.name}" class="generated-image">
        </div>
      `;

      this.showNotification("Image uploaded successfully!", "success");
      await this.saveCardToLibrary();
      await this.refreshLibraryViews();
    } catch (error) {
      console.error("Image upload error:", error);
      this.showNotification(`Image upload failed: ${error.message}`, "error");
    } finally {
      event.target.value = ""; // Reset input
    }
  }

  // Helper method to download blobs
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  handleRegenerate() {
    // Instead of just clearing, automatically trigger generation again
    this.hideResultSection();
    this.clearStream();
    const streamSection = document.querySelector(".stream-section");
    streamSection.style.display = "none";
    this.currentCharacter = null;
    this.currentImageUrl = null;
    document.getElementById("image-controls").style.display = "none";

    // Clear image content and prompt editor
    const imageContent = document.getElementById("image-content");
    const promptEditor = document.getElementById("image-prompt-editor");
    const customPromptTextarea = document.getElementById("custom-image-prompt");

    if (imageContent) {
      imageContent.innerHTML = `
        <div class="image-placeholder">
          <div class="loading-spinner"></div>
        </div>
      `;
    }

    if (promptEditor) {
      promptEditor.style.display = "none";
    }

    if (customPromptTextarea) {
      customPromptTextarea.value = "";
      window.updatePromptCharCount();
    }

    // Auto-trigger generation with the same inputs
    const concept = document.getElementById("character-concept").value.trim();
    if (concept) {
      this.showNotification("Regenerating character...", "info");
      // Small delay to allow UI to update
      setTimeout(() => {
        this.handleGenerate();
      }, 100);
    } else {
      // If no concept, just focus on the input
      document.getElementById("character-concept").focus();
      this.showNotification(
        "Please enter a character concept first",
        "warning",
      );
    }
  }

  setGeneratingState(isGenerating) {
    const generateBtn = document.getElementById("generate-btn");
    const stopBtn = document.getElementById("stop-btn");
    const btnText = generateBtn.querySelector(".btn-text");
    const btnLoading = generateBtn.querySelector(".btn-loading");

    if (isGenerating) {
      generateBtn.disabled = true;
      btnText.style.display = "none";
      btnLoading.style.display = "inline";
      stopBtn.style.display = "inline-block";
    } else {
      generateBtn.disabled = false;
      btnText.style.display = "inline";
      btnLoading.style.display = "none";
      stopBtn.style.display = "none";
    }
  }

  handleStop() {
    if (this.isGenerating) {
      this.showStreamMessage("\n\n🛑 Stopping generation...\n");
      window.apiHandler.stopGeneration();
      this.isGenerating = false;
      this.setGeneratingState(false);
      this.showNotification("Generation stopped by user", "warning");
    }
  }

  displayCharacter() {
    // Update all character fields
    const descriptionTextarea = document.getElementById(
      "character-description",
    );
    const personalityTextarea = document.getElementById(
      "character-personality",
    );
    const scenarioTextarea = document.getElementById("character-scenario");
    const firstMessageTextarea = document.getElementById(
      "character-first-message",
    );

    descriptionTextarea.value = this.currentCharacter.description || "";
    personalityTextarea.value = this.currentCharacter.personality || "";
    scenarioTextarea.value = this.currentCharacter.scenario || "";
    firstMessageTextarea.value = this.currentCharacter.firstMessage || "";

    // Hide all reset buttons initially (will show if user edits)
    const resetDescriptionBtn = document.getElementById(
      "reset-description-btn",
    );
    const resetPersonalityBtn = document.getElementById(
      "reset-personality-btn",
    );
    const resetScenarioBtn = document.getElementById("reset-scenario-btn");
    const resetFirstMessageBtn = document.getElementById(
      "reset-first-message-btn",
    );

    if (resetDescriptionBtn) resetDescriptionBtn.style.display = "none";
    if (resetPersonalityBtn) resetPersonalityBtn.style.display = "none";
    if (resetScenarioBtn) resetScenarioBtn.style.display = "none";
    if (resetFirstMessageBtn) resetFirstMessageBtn.style.display = "none";

    // Reset example messages section for new character
    const exampleMessagesOutput = document.getElementById(
      "example-messages-output",
    );
    const copyExamplesBtn = document.getElementById("copy-examples-btn");
    if (exampleMessagesOutput) {
      exampleMessagesOutput.textContent = "";
      exampleMessagesOutput.style.display = "none";
    }
    if (copyExamplesBtn) {
      copyExamplesBtn.style.display = "none";
    }

    // Show JSON download button whenever character data is available
    const downloadJsonBtn = document.getElementById("download-json-btn");
    if (downloadJsonBtn) {
      downloadJsonBtn.style.display = "inline-flex";
    }
  }

  showResultSection() {
    const resultSection = document.querySelector(".result-section");
    const downloadBtn = document.getElementById("download-btn");
    const downloadJsonBtn = document.getElementById("download-json-btn");

    resultSection.style.display = "block";
    downloadBtn.style.display = "inline-flex";

    // Show JSON download button when character data is available
    if (downloadJsonBtn && this.currentCharacter) {
      downloadJsonBtn.style.display = "inline-flex";
    }

    // Smooth scroll to results
    resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  hideResultSection() {
    const resultSection = document.querySelector(".result-section");
    const downloadBtn = document.getElementById("download-btn");
    const downloadJsonBtn = document.getElementById("download-json-btn");

    resultSection.style.display = "none";
    downloadBtn.style.display = "none";
    if (downloadJsonBtn) downloadJsonBtn.style.display = "none";
  }

  async handleReferenceImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      this.imageGenerator.validateImageFile(file);

      const dataUrl = await this.prepareReferenceImageForVision(file);

      this.referenceImageDataUrl = dataUrl;
      this.updateReferenceImagePreview(dataUrl);

      const descriptionField = document.getElementById(
        "reference-image-description",
      );
      const hint = descriptionField?.value?.trim() || "";

      this.showNotification("Analyzing reference image...", "info");
      const imageDescription = await this.apiHandler.describeReferenceImage(
        dataUrl,
        hint,
      );
      if (descriptionField) {
        descriptionField.value = imageDescription;
      }
      this.showNotification("Reference image description generated", "success");
    } catch (error) {
      console.error("Reference image handling failed:", error);
      this.showNotification(
        `Reference image analysis failed: ${error.message}`,
        "warning",
      );
    } finally {
      event.target.value = "";
    }
  }

  async prepareReferenceImageForVision(file) {
    const sourceDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () =>
        reject(new Error("Failed to read reference image file"));
      reader.readAsDataURL(file);
    });

    // Resize/compress before sending to vision to avoid payload-too-large errors.
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to process image"));
      image.src = sourceDataUrl;
    });

    const maxSide = 1024;
    const ratio = Math.min(maxSide / img.width, maxSide / img.height, 1);
    const targetWidth = Math.max(1, Math.round(img.width * ratio));
    const targetHeight = Math.max(1, Math.round(img.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    return canvas.toDataURL("image/jpeg", 0.82);
  }

  updateReferenceImagePreview(dataUrl) {
    const preview = document.getElementById("reference-image-preview");
    if (!preview) return;

    preview.style.display = "block";
    preview.innerHTML = `<img src="${dataUrl}" alt="Reference image" style="width: 100%; display: block;" />`;
  }

  normalizeCharacterFromSpec(specData) {
    if (specData?.data) {
      return {
        name: specData.data.name || "Unnamed Character",
        description: specData.data.description || "",
        personality: specData.data.personality || "",
        scenario: specData.data.scenario || "",
        firstMessage: specData.data.first_mes || "",
      };
    }

    return {
      name: specData.name || "Unnamed Character",
      description: specData.description || "",
      personality: specData.personality || "",
      scenario: specData.scenario || "",
      firstMessage: specData.firstMessage || specData.first_mes || "",
    };
  }

  async handleImportCard(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      let characterData = null;
      let importedImageUrl = "";

      if (
        file.type === "image/png" ||
        file.name.toLowerCase().endsWith(".png")
      ) {
        const extracted = await this.pngEncoder.extractCharacterData(file);
        characterData = this.normalizeCharacterFromSpec(extracted);
        importedImageUrl = URL.createObjectURL(file);
      } else {
        const text = await file.text();
        const parsed = JSON.parse(text);
        characterData = this.normalizeCharacterFromSpec(parsed);
      }

      if (!characterData) {
        throw new Error("Unable to parse card content");
      }

      this.currentCharacter = characterData;
      this.originalCharacter = JSON.parse(JSON.stringify(characterData));
      this.displayCharacter();
      this.showResultSection();

      if (importedImageUrl) {
        this.currentImageUrl = importedImageUrl;
        const imageContainer = document.getElementById("image-content");
        imageContainer.innerHTML = `
          <div class="image-container">
            <img src="${importedImageUrl}" alt="${characterData.name}" class="generated-image">
          </div>
        `;
      }

      document.getElementById("image-controls").style.display = "block";
      await this.saveCardToLibrary();
      await this.refreshLibraryViews();
      this.showNotification("Card imported for editing", "success");
    } catch (error) {
      console.error("Card import failed:", error);
      this.showNotification(`Card import failed: ${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  }

  async handleReviseCharacter() {
    if (!this.currentCharacter) {
      this.showNotification("Generate or import a character first", "warning");
      return;
    }

    const revisionInstruction = document
      .getElementById("revision-instruction")
      ?.value?.trim();
    if (!revisionInstruction) {
      this.showNotification("Enter a revision request first", "warning");
      return;
    }

    try {
      const pov = document.getElementById("pov-select")?.value || "first";
      this.showNotification("Applying AI revision...", "info");
      const revised = await this.apiHandler.reviseCharacter(
        this.currentCharacter,
        revisionInstruction,
        pov,
      );
      this.currentCharacter = revised;
      this.originalCharacter = JSON.parse(JSON.stringify(revised));
      this.displayCharacter();
      await this.saveCardToLibrary();
      await this.refreshLibraryViews();
      this.showNotification("Character revised successfully", "success");
    } catch (error) {
      console.error("Revision failed:", error);
      this.showNotification(`Revision failed: ${error.message}`, "error");
    }
  }

  async handleGenerateExampleMessages() {
    if (!this.currentCharacter) {
      this.showNotification("Generate or import a character first", "warning");
      return;
    }

    const count = parseInt(
      document.getElementById("example-messages-count")?.value || "3",
      10,
    );
    const generateBtn = document.getElementById("generate-examples-btn");
    const copyBtn = document.getElementById("copy-examples-btn");
    const outputDiv = document.getElementById("example-messages-output");

    try {
      generateBtn.disabled = true;
      generateBtn.textContent = "⏳ Generating...";
      this.showNotification("Generating example messages...", "info");

      const pov = document.getElementById("pov-select")?.value || "first";
      const examples = await this.apiHandler.generateExampleMessages(
        this.currentCharacter,
        count,
        pov,
      );

      outputDiv.textContent = examples;
      outputDiv.style.display = "block";
      copyBtn.style.display = "inline-block";
      this.showNotification(`Generated ${count} example message(s)`, "success");
    } catch (error) {
      console.error("Example generation failed:", error);
      this.showNotification(`Generation failed: ${error.message}`, "error");
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "✨ Generate Examples";
    }
  }

  async handleCopyExampleMessages() {
    const outputDiv = document.getElementById("example-messages-output");
    const text = outputDiv?.textContent;

    if (!text) {
      this.showNotification("No examples to copy", "warning");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      this.showNotification("Copied to clipboard!", "success");
    } catch (error) {
      console.error("Copy failed:", error);
      this.showNotification("Failed to copy to clipboard", "error");
    }
  }

  async savePromptToLibrary(promptData) {
    if (!this.storageReady || !this.storage) return false;
    try {
      const normalized = this.preparePromptRecordForStorage(promptData);
      const fingerprint = [
        normalized.concept || "",
        normalized.characterName || "",
        normalized.pov || "",
        normalized.referenceImageDescription || "",
      ].join("::");

      const existingPrompts = await this.storage.listPrompts();
      const existing = existingPrompts.find(
        (entry) => entry.fingerprint === fingerprint,
      );

      const { _trimmedFields, ...promptRecord } = normalized;
      const fullRecord = {
        ...promptRecord,
        fingerprint,
      };
      if (Number.isInteger(existing?.id) && existing.id > 0) {
        fullRecord.id = existing.id;
      }
      await this.storage.savePrompt(fullRecord);

      if (_trimmedFields?.length) {
        this.showNotification(
          `Prompt saved. Omitted large ${_trimmedFields.join(" and ")} snapshot for storage safety.`,
          "warning",
        );
      }
      return true;
    } catch (error) {
      console.error("Failed to save prompt (full record):", error);

      // Retry with minimal payload so prompts still persist even if optional
      // lorebook/reference snapshots exceed storage limits.
      try {
        const minimal = this.preparePromptRecordForStorage(promptData, {
          minimal: true,
        });
        const fingerprint = [
          minimal.concept || "",
          minimal.characterName || "",
          minimal.pov || "",
          minimal.referenceImageDescription || "",
        ].join("::");

        const existingPrompts = await this.storage.listPrompts();
        const existing = existingPrompts.find(
          (entry) => entry.fingerprint === fingerprint,
        );

        const { _trimmedFields, ...minimalRecord } = minimal;
        const retryRecord = {
          ...minimalRecord,
          fingerprint,
        };
        if (Number.isInteger(existing?.id) && existing.id > 0) {
          retryRecord.id = existing.id;
        }
        await this.storage.savePrompt(retryRecord);

        this.showNotification(
          "Prompt saved in compact mode (large context omitted).",
          "warning",
        );
        return true;
      } catch (retryError) {
        console.error("Failed to save prompt (compact retry):", retryError);
        this.updateLibraryStatus(
          "Failed to save prompt. Check browser storage permissions.",
        );
        return false;
      }
    }
  }

  preparePromptRecordForStorage(promptData, options = {}) {
    const minimal = Boolean(options.minimal);
    const maxEmbeddedChars = 400000;

    const safe = {
      concept: promptData?.concept || "",
      characterName: promptData?.characterName || "",
      pov: promptData?.pov || "first",
      referenceImageDescription: promptData?.referenceImageDescription || "",
      referenceImageDataUrl: "",
      lorebookData: null,
      _trimmedFields: [],
    };

    if (minimal) {
      return safe;
    }

    const referenceImageDataUrl = promptData?.referenceImageDataUrl || "";
    if (referenceImageDataUrl) {
      if (referenceImageDataUrl.length <= maxEmbeddedChars) {
        safe.referenceImageDataUrl = referenceImageDataUrl;
      } else {
        safe._trimmedFields.push("reference-image");
      }
    }

    if (promptData?.lorebookData) {
      try {
        const lorebookJson = JSON.stringify(promptData.lorebookData);
        if (lorebookJson.length <= maxEmbeddedChars) {
          safe.lorebookData = JSON.parse(lorebookJson);
        } else {
          safe._trimmedFields.push("lorebook");
        }
      } catch (error) {
        safe._trimmedFields.push("lorebook");
      }
    }

    return safe;
  }

  async saveCardToLibrary() {
    if (!this.storageReady || !this.storage || !this.currentCharacter) return;

    try {
      let imageBlob = null;
      if (this.currentImageUrl) {
        try {
          imageBlob = await this.imageGenerator.convertToBlob(
            this.currentImageUrl,
          );
        } catch (error) {
          console.warn("Skipping image blob save:", error.message);
        }
      }

      await this.storage.saveCard({
        characterName: this.currentCharacter.name || "Unnamed Character",
        character: JSON.parse(JSON.stringify(this.currentCharacter)),
        imageBlob,
      });
    } catch (error) {
      console.error("Failed to save card:", error);
    }
  }

  formatLibraryTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString();
  }

  async refreshLibraryViews() {
    if (!this.storageReady || !this.storage) {
      this.renderStorageUnavailableState();
      return;
    }

    try {
      const [prompts, cards] = await Promise.all([
        this.storage.listPrompts(),
        this.storage.listCards(),
      ]);

      const promptList = document.getElementById("stored-prompts-list");
      const cardList = document.getElementById("stored-cards-list");

      if (promptList) {
        if (!prompts.length) {
          promptList.innerHTML =
            '<p class="library-empty">No saved prompts yet.</p>';
        } else {
          promptList.innerHTML = prompts
            .map(
              (prompt) => `
                <div class="library-item">
                  <div class="library-item-title">${prompt.characterName || "(No name)"} - ${prompt.pov || "first"} POV</div>
                  <div class="library-item-date">${this.formatLibraryTime(prompt.updatedAt)}</div>
                  <div class="library-item-actions">
                    <button class="btn-small" data-action="load-prompt" data-id="${prompt.id}">Load</button>
                    <button class="btn-small" data-action="delete-prompt" data-id="${prompt.id}">Delete</button>
                  </div>
                </div>
              `,
            )
            .join("");
        }
      }

      if (cardList) {
        if (!cards.length) {
          cardList.innerHTML =
            '<p class="library-empty">No saved cards yet.</p>';
        } else {
          cardList.innerHTML = cards
            .map(
              (card) => `
                <div class="library-item">
                  <div class="library-item-title">${card.characterName || "Unnamed Character"}</div>
                  <div class="library-item-date">${this.formatLibraryTime(card.updatedAt)}</div>
                  <div class="library-item-actions">
                    <button class="btn-small" data-action="load-card" data-id="${card.id}">Load</button>
                    <button class="btn-small" data-action="delete-card" data-id="${card.id}">Delete</button>
                  </div>
                </div>
              `,
            )
            .join("");
        }
      }

      this.updateLibraryStatus(
        `Saved ${prompts.length} prompt${prompts.length === 1 ? "" : "s"} and ${cards.length} card${cards.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      console.error("Failed to refresh IndexedDB library view:", error);
      this.updateLibraryStatus("Failed to load local library.");
    }
  }

  renderStorageUnavailableState() {
    const promptList = document.getElementById("stored-prompts-list");
    const cardList = document.getElementById("stored-cards-list");
    const message =
      '<p class="library-empty">Local storage is unavailable in this browser/session.</p>';

    if (promptList) {
      promptList.innerHTML = message;
    }
    if (cardList) {
      cardList.innerHTML = message;
    }
  }

  updateLibraryStatus(text) {
    const status = document.getElementById("library-status");
    if (status) {
      status.textContent = text;
    }
  }

  async handleLibraryPromptClick(event) {
    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) return;

    const action = actionElement.dataset.action;
    const id = Number(actionElement.dataset.id);

    try {
      if (action === "load-prompt") {
        const prompt = await this.storage.getPrompt(id);
        if (!prompt) return;
        document.getElementById("character-concept").value =
          prompt.concept || "";
        document.getElementById("character-name").value =
          prompt.characterName || "";
        document.getElementById("pov-select").value = prompt.pov || "first";
        const refDescription = document.getElementById(
          "reference-image-description",
        );
        if (refDescription) {
          refDescription.value = prompt.referenceImageDescription || "";
        }
        if (prompt.referenceImageDataUrl) {
          this.referenceImageDataUrl = prompt.referenceImageDataUrl;
          this.updateReferenceImagePreview(prompt.referenceImageDataUrl);
        }
        this.lorebookData = prompt.lorebookData || null;
        this.showNotification("Prompt loaded", "success");
      } else if (action === "delete-prompt") {
        await this.storage.deletePrompt(id);
        await this.refreshLibraryViews();
        this.showNotification("Prompt deleted", "info");
      }
    } catch (error) {
      console.error("Prompt library action failed:", error);
      this.showNotification("Prompt action failed", "error");
    }
  }

  async handleLibraryCardClick(event) {
    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) return;

    const action = actionElement.dataset.action;
    const id = Number(actionElement.dataset.id);

    try {
      if (action === "load-card") {
        const card = await this.storage.getCard(id);
        if (!card?.character) return;
        this.currentCharacter = card.character;
        this.originalCharacter = JSON.parse(JSON.stringify(card.character));
        this.displayCharacter();
        this.showResultSection();
        document.getElementById("image-controls").style.display = "block";

        if (card.imageBlob instanceof Blob) {
          if (
            this.currentImageUrl &&
            this.currentImageUrl.startsWith("blob:")
          ) {
            URL.revokeObjectURL(this.currentImageUrl);
          }
          this.currentImageUrl = URL.createObjectURL(card.imageBlob);
          const imageContainer = document.getElementById("image-content");
          imageContainer.innerHTML = `
            <div class="image-container">
              <img src="${this.currentImageUrl}" alt="${card.character.name || "Character"}" class="generated-image">
            </div>
          `;
        }
        this.showNotification("Card loaded", "success");
      } else if (action === "delete-card") {
        await this.storage.deleteCard(id);
        await this.refreshLibraryViews();
        this.showNotification("Card deleted", "info");
      }
    } catch (error) {
      console.error("Card library action failed:", error);
      this.showNotification("Card action failed", "error");
    }
  }

  showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        `;

    // Set background color based on type
    const colors = {
      success: "#28a745",
      error: "#dc3545",
      warning: "#ffc107",
      info: "#0066cc",
    };

    notification.style.backgroundColor = colors[type] || colors.info;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.style.transform = "translateX(0)";
    }, 10);

    // Remove after 5 seconds
    setTimeout(() => {
      notification.style.transform = "translateX(100%)";
      setTimeout(() => {
        if (notification.parentNode) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 5000);
  }

  // Utility methods
  validateInput() {
    const concept = document.getElementById("character-concept").value.trim();
    const characterName = document
      .getElementById("character-name")
      .value.trim();

    const errors = [];

    if (!concept) {
      errors.push("Character concept is required");
    } else if (concept.length < 10) {
      errors.push("Character concept should be at least 10 characters");
    } else if (concept.length > 1000) {
      errors.push("Character concept should be less than 1000 characters");
    }

    if (characterName && characterName.length > 50) {
      errors.push("Character name should be less than 50 characters");
    }

    return errors;
  }

  // Keyboard shortcuts
  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Ctrl/Cmd + Enter to generate
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (!this.isGenerating) {
          this.handleGenerate();
        }
      }

      // Escape to cancel/clear
      if (e.key === "Escape") {
        if (this.isGenerating) {
          // Cancel generation (would need implementation in API calls)
          this.showNotification(
            "Cannot cancel generation in progress",
            "warning",
          );
        } else {
          this.handleRegenerate();
        }
      }
    });
  }
  handleLorebookUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        this.lorebookData = json;

        // Update UI to show loaded status
        const statusIcon = document.getElementById("lorebook-status");
        statusIcon.style.display = "block";
        this.showNotification("Lorebook loaded successfully!", "success");
        console.log("Lorebook loaded:", this.lorebookData);
      } catch (error) {
        console.error("Error parsing lorebook:", error);
        this.showNotification("Failed to parse Lorebook JSON", "error");
        this.lorebookData = null;
        document.getElementById("lorebook-status").style.display = "none";
      }
    };
    reader.readAsText(file);
  }
}

// Update prompt character counter
window.updatePromptCharCount = function () {
  const textarea = document.getElementById("custom-image-prompt");
  const counter = document.getElementById("prompt-char-count");

  if (textarea && counter) {
    const length = textarea.value.length;
    counter.textContent = `${length}/1000`;

    // Change color based on character count
    if (length >= 950) {
      counter.style.color = "#ef4444"; // Red
      counter.style.color = "#f59e0b"; // Orange
    } else {
      counter.style.color = "#9ca3af"; // Gray
    }
  }
};

// Wait for DOM to be loaded
document.addEventListener("DOMContentLoaded", async () => {
  // Wait a moment to ensure all modules are loaded
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Verify all required modules are loaded
  if (
    !window.config ||
    !window.apiHandler ||
    !window.characterGenerator ||
    !window.imageGenerator ||
    !window.pngEncoder
  ) {
    console.error("Missing modules:", {
      config: !!window.config,
      apiHandler: !!window.apiHandler,
      characterGenerator: !!window.characterGenerator,
      imageGenerator: !!window.imageGenerator,
      pngEncoder: !!window.pngEncoder,
    });
    return;
  }

  // Initialize app
  window.app = new CharacterGeneratorApp();

  // Add some CSS for tags
  const style = document.createElement("style");
  style.textContent = `
        .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-top: 0.5rem;
        }

        .tag {
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.875rem;
            font-weight: 500;
        }

        .character-section {
            margin-bottom: 1.5rem;
        }

        .character-section strong {
            color: var(--text-primary);
            display: block;
            margin-bottom: 0.5rem;
        }

        .image-container {
            text-align: center;
        }

        .generated-image {
            max-width: 100%;
            height: auto;
            border-radius: var(--radius);
            box-shadow: var(--shadow-sm);
        }

        .form-section {
            background: var(--bg-tertiary);
            padding: 1rem;
            border-radius: calc(var(--radius) / 2);
            margin-bottom: 1rem;
        }

        .form-section-title {
            font-weight: 600;
            margin-bottom: 1rem;
            color: var(--text-primary);
        }
    `;
  document.head.appendChild(style);

  // Console welcome message
  console.log(
    "%c🎭 SillyTavern Character Generator",
    "font-size: 20px; font-weight: bold; color: #0066cc;",
  );
  console.log(
    "%cCreate amazing characters with AI!",
    "font-size: 14px; color: #666;",
  );
  console.log(
    "%cTip: Press Ctrl+Enter to generate a character",
    "font-size: 12px; color: #999;",
  );
});
