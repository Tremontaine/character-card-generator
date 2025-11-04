// Main Application Controller
class CharacterGeneratorApp {
  constructor() {
    this.characterGenerator = window.characterGenerator;
    this.imageGenerator = window.imageGenerator;
    this.pngEncoder = window.pngEncoder;
    this.config = window.config;
    this.apiHandler = window.apiHandler;

    this.currentCharacter = null;
    this.originalCharacter = null; // Store the original AI-generated version
    this.currentImageUrl = null;
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
    this.config.saveToForm();
    this.bindEvents();
    this.checkAPIStatus();
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
      "#text-api-base, #text-api-key, #text-model, #image-api-base, #image-api-key, #image-model",
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

      // Generate character data with streaming
      this.showStreamMessage("🚀 Starting character generation...\n\n");
      this.currentCharacter = await this.characterGenerator.generateCharacter(
        concept,
        characterName,
        (token, fullContent) => this.handleCharacterStream(token, fullContent),
      );

      // Store original for reset functionality
      this.originalCharacter = JSON.parse(
        JSON.stringify(this.currentCharacter),
      );

      this.showStreamMessage("\n\n✅ Character generation complete!\n");

      // Display character
      this.displayCharacter();

      // Check if image generation is configured and enabled
      const imageApiBase = this.config.get("api.image.baseUrl");
      const imageApiKey = this.config.get("api.image.apiKey");
      const enableImageGeneration = this.config.get(
        "app.enableImageGeneration",
      );

      if (imageApiBase && imageApiKey && enableImageGeneration) {
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

        if (promptEditor) {
          promptEditor.style.display = "block";

          // Generate prompt only when image generation is enabled or if no prompt exists yet
          if (
            customPromptTextarea &&
            (!window.apiHandler.lastGeneratedImagePrompt ||
              enableImageGeneration)
          ) {
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
            // Update character counter
            window.updatePromptCharCount();
          } else if (
            customPromptTextarea &&
            window.apiHandler.lastGeneratedImagePrompt
          ) {
            // Use the previously generated prompt
            customPromptTextarea.value =
              window.apiHandler.lastGeneratedImagePrompt;
            // Update character counter
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

    // Update character counter
    window.updatePromptCharCount();

    // Clean up previous blob URL if it exists
    if (this.currentImageUrl && this.currentImageUrl.startsWith("blob:")) {
      console.log("🗑️ Revoking previous blob URL:", this.currentImageUrl);
      URL.revokeObjectURL(this.currentImageUrl);
    }

    const imageResult = await this.imageGenerator.generateAndDisplayImage(
      this.currentCharacter.description,
      this.currentCharacter.name,
      imageContainer,
      customPrompt || null,
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

  handleDownloadJSON() {
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
    } else if (length >= 850) {
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
