// API Handler for OpenAI-compatible endpoints with streaming support
class APIHandler {
  constructor() {
    this.config = window.config;
    this.lastGeneratedImagePrompt = null; // Store the last generated prompt for display
    this.currentAbortController = null; // Store current abort controller for stopping generation
    this.currentReader = null; // Store current stream reader for cancellation
    this.userStopRequested = false;
  }

  async makeRequest(endpoint, data, isImageRequest = false, stream = false) {
    // Use proxy server to bypass browser API restrictions
    // Both Nginx (prod/docker) and http-server (dev) are configured to proxy /api to the backend
    const baseUrl = "";
    const proxyEndpoint = isImageRequest
      ? "/api/image/generations"
      : "/api/text/chat/completions";
    endpoint = proxyEndpoint;

    const apiKey = isImageRequest
      ? this.config.get("api.image.apiKey")
      : this.config.get("api.text.apiKey");
    const apiUrl = isImageRequest
      ? this.config.get("api.image.baseUrl")
      : this.config.get("api.text.baseUrl");
    const timeout = isImageRequest
      ? this.config.get("api.image.timeout")
      : this.config.get("api.text.timeout");

    if (!apiKey) {
      throw new Error(
        "API key is required. Please configure your API settings.",
      );
    }

    if (!apiUrl) {
      throw new Error(
        "API URL is required. Please configure your API Base URL in settings.",
      );
    }

    const url = `${baseUrl}${endpoint}`;
    // Proxy server handles authentication, pass API key and actual API URL in headers
    const headers = {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      "X-API-URL": apiUrl,
    };

    // Add streaming headers if needed
    if (stream) {
      headers.Accept = "text/event-stream";
    }

    const controller = new AbortController();
    this.userStopRequested = false;
    this.currentAbortController = controller;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    this.config.log(`Making request to: ${url}`);
    this.config.log(`Request data:`, data);
    this.config.log(`Headers:`, headers);
    this.config.log(`Using proxy server: ${baseUrl}`);
    this.config.log(`API Key (first 10 chars): ${apiKey.substring(0, 10)}...`);
    this.config.log(`API Key length: ${apiKey.length}`);

    this.config.log("API Request:", {
      url,
      method: "POST",
      headers: {
        ...headers,
        Authorization: headers.Authorization
          ? "[REDACTED]"
          : headers["X-API-Key"]
            ? "[REDACTED]"
            : "NO AUTH",
      },
      dataKeys: Object.keys(data),
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { ...headers, Authorization: "[REDACTED]" },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      this.config.log(`Response status: ${response.status}`);
      this.config.log(`Response headers:`, [...response.headers.entries()]);

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData = {};
        try {
          const responseText = await response.text();
          console.error("API Error Response (raw):", responseText);
          errorData = JSON.parse(responseText);
          console.error("API Error Response (parsed):", errorData);
        } catch (e) {
          console.error("Failed to parse error response as JSON:", e);
        }

        const errorMessage =
          errorData.error?.message ||
          errorData.message ||
          errorData.detail ||
          errorData.error ||
          response.statusText;

        // Special handling for 401 errors
        if (response.status === 401) {
          throw new Error(`Authorization Error: ${errorMessage}

    Possible solutions:
    1. Check if API key is correct
    2. API key may be expired - generate a new one
    3. Try different authorization method (some APIs use X-API-Key header instead of Bearer)
    4. Ensure you're using the correct API endpoint`);
        }

        throw new Error(`API Error: ${response.status} - ${errorMessage}`);
      }

      if (stream) {
        return response;
      } else if (isImageRequest) {
        return response;
      } else {
        const result = await response.json();
        this.config.log("API Response:", result);
        return result;
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === "AbortError") {
        if (this.userStopRequested) {
          throw new Error("Generation stopped by user.");
        }
        throw new Error(
          "Request timed out or was interrupted. Consider increasing API timeout in settings.",
        );
      }

      console.error("API Request Failed:", error);
      throw error;
    } finally {
      this.currentAbortController = null;
    }
  }

  async handleStreamResponse(response, onStream) {
    const reader = response.body.getReader();
    this.currentReader = reader; // Store reader reference for cancellation
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === "") continue;
          if (line.startsWith("data: ")) {
            const data = line.slice(6);

            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || "";

              if (content) {
                fullContent += content;
                onStream(content, fullContent);
              }
            } catch (e) {
              console.warn("Failed to parse streaming data:", data);
            }
          }
        }
      }

      return fullContent;
    } catch (error) {
      console.error("Stream processing error:", error);
      throw error;
    } finally {
      this.currentReader = null;
    }
  }

  async generateCharacter(
    prompt,
    characterName,
    onStream = null,
    pov = "first",
    lorebook = null,
  ) {
    const characterPrompt = this.buildCharacterPrompt(
      prompt,
      characterName,
      pov,
      lorebook,
    );
    const model = this.config.get("api.text.model") || "glm-4-6"; // Fallback to your specified model

    this.config.log("Using text model:", model);
    this.config.log(
      "Character name provided:",
      characterName || "(AI will generate)",
    );

    const data = {
      model: model,
      messages: [
        {
          role: "system",
          content: characterPrompt.systemPrompt,
        },
        {
          role: "user",
          content: characterPrompt.userPrompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 8192,
      stream: !!onStream,
    };

    if (onStream) {
      // Handle streaming response
      const response = await this.makeRequest(
        "/chat/completions",
        data,
        false,
        true,
      );
      return this.handleStreamResponse(response, onStream);
    } else {
      // Handle regular response with retry for auth errors
      try {
        const response = await this.makeRequest(
          "/chat/completions",
          data,
          false,
          false,
        );
        return this.processNormalResponse(response);
      } catch (error) {
        if (
          error.message.includes("401") ||
          error.message.includes("Authorization")
        ) {
          this.config.log("Trying alternative auth methods...");
          const response = await this.tryAlternativeAuth(
            "/chat/completions",
            data,
          );
          return this.processNormalResponse(response);
        }
        throw error;
      }
    }
  }

  async generateImage(
    characterDescription,
    characterName,
    customPrompt = null,
  ) {
    // Use custom prompt if provided, otherwise generate one from AI
    let imagePrompt;
    if (customPrompt) {
      imagePrompt = customPrompt;
      // Apply length limit to custom prompts as well
      imagePrompt = await this.truncateImagePrompt(imagePrompt);
    } else {
      // Use AI to generate a detailed natural language prompt
      console.log("=== GENERATING IMAGE PROMPT VIA TEXT API ===");
      console.log("Character name:", characterName);
      console.log(
        "Character description length:",
        characterDescription?.length || 0,
      );

      try {
        imagePrompt = await this.generateImagePrompt(
          characterDescription,
          characterName,
        );
      } catch (error) {
        console.error("Failed to generate image prompt:", error);
        throw new Error(`Failed to generate image prompt: ${error.message}`);
      }
    }

    // Validate that we have a prompt before proceeding
    if (
      !imagePrompt ||
      typeof imagePrompt !== "string" ||
      imagePrompt.trim().length === 0
    ) {
      console.error("=== IMAGE PROMPT VALIDATION FAILED ===");
      console.error("Image prompt value:", imagePrompt);
      console.error("Image prompt type:", typeof imagePrompt);
      throw new Error(
        "Image prompt is empty or invalid. Cannot generate image without a prompt. " +
          "This usually means the text API failed to generate a prompt description.",
      );
    }

    // Store the prompt so it can be accessed later
    this.lastGeneratedImagePrompt = imagePrompt;

    const model = this.config.get("api.image.model");

    console.log("=== SENDING TO IMAGE API ===");
    console.log("Using image model:", model);
    console.log("Using custom prompt:", !!customPrompt);
    console.log("Image prompt length:", imagePrompt.length);
    console.log("Full image prompt being sent:");
    console.log(imagePrompt);
    console.log("=== END PROMPT ===");

    // Use ImageRouter format with optional size parameter
    const data = {
      model: model,
      prompt: imagePrompt,
      n: 1,
      response_format: "url",
    };

    // Add size only if user has specified it
    const imageSize = this.config.get("api.image.size");
    if (imageSize && imageSize.trim() !== "") {
      data.size = imageSize.trim();
    }
    const endpoint = "/api/image/generations";

    const response = await this.makeRequest(endpoint, data, true);

    // Check if response is an error before parsing
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Image API error response:", errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        throw new Error(`Image API Error (${response.status}): ${errorText}`);
      }
      const errorMessage =
        errorData.error?.message ||
        errorData.message ||
        errorData.error ||
        "Unknown error";
      throw new Error(`Image API Error (${response.status}): ${errorMessage}`);
    }

    const result = await response.json();

    // Check if response contains an error object
    if (result.error) {
      console.error("Image API returned error object:", result.error);
      const errorMsg =
        result.error.message || result.error.details || result.error;
      throw new Error(`Image API Error: ${errorMsg}`);
    }

    if (result.data && result.data.length > 0) {
      return result.data[0].url;
    } else if (result.image) {
      return result.image;
    } else if (result.url) {
      return result.url;
    } else {
      console.error(
        "Unexpected image API response format. Full response:",
        result,
      );
      throw new Error(
        "Unexpected image API response format: " + JSON.stringify(result),
      );
    }
  }

  async generateImagePrompt(characterDescription, characterName) {
    // Validate inputs
    if (!characterDescription || !characterName) {
      throw new Error(
        "Character description and name are required to generate an image prompt",
      );
    }

    // Build the meta-prompt that asks AI to create an image prompt
    const metaPrompt = this.buildImagePromptInstruction(
      characterDescription,
      characterName,
    );

    // Call the text API to generate the actual image prompt
    // Use streaming mode to avoid reasoning_content issue with GLM models
    const model = this.config.get("api.text.model");
    const data = {
      model: model,
      messages: [
        {
          role: "user",
          content: metaPrompt,
        },
      ],
      max_tokens: 8192,
      temperature: 0.7,
      stream: true, // Enable streaming to get only content, not reasoning
    };

    const endpoint = "/api/text/chat/completions";

    let response;
    try {
      response = await this.makeRequest(endpoint, data, false, true);
    } catch (error) {
      console.error("Text API request failed:", error);
      throw new Error(
        `Failed to call text API for image prompt generation: ${error.message}`,
      );
    }

    // Handle streaming response - collect all content
    const generatedPrompt = await this.handleStreamResponse(response, () => {});

    if (!generatedPrompt || generatedPrompt.trim().length === 0) {
      console.error("Text API returned empty prompt");
      throw new Error("Text API returned an empty image prompt");
    }

    // Ensure the prompt fits within 1000 character limit with smart truncation
    return await this.truncateImagePrompt(generatedPrompt.trim());
  }

  async truncateImagePrompt(prompt) {
    const MAX_LENGTH = 1000;

    if (prompt.length <= MAX_LENGTH) {
      return prompt;
    }

    console.log(
      `🔧 Image prompt too long (${prompt.length} chars). Using AI to shorten to ${MAX_LENGTH} chars...`,
    );

    // Use AI to intelligently shorten the prompt instead of mechanical truncation
    const model = this.config.get("api.text.model");

    // console.log(`🔍 DEBUG: Calling AI to shorten prompt`);
    // console.log(`🔍 DEBUG: Model: ${model}`);
    // console.log(`🔍 DEBUG: Original prompt length: ${prompt.length}`);

    const data = {
      model: model,
      messages: [
        {
          role: "user",
          content: `The following image generation prompt is too long. Shorten it to EXACTLY one paragraph (around 800-900 characters) while preserving all the key visual details, character features, and mood. Do NOT add explanations, just output the shortened prompt directly.

Original prompt:
${prompt}

Shortened prompt (one paragraph):`,
        },
      ],
      max_tokens: 8192, // High limit for thinking models (reasoning + output)
      temperature: 0.3,
      stream: true,
    };

    const endpoint = "/api/text/chat/completions";

    try {
      // console.log(`🔍 DEBUG: Sending request to ${endpoint}`);
      const response = await this.makeRequest(endpoint, data, false, true);

      // console.log(`🔍 DEBUG: Got response, processing stream...`);
      const shortenedPrompt = await this.handleStreamResponse(
        response,
        (chunk, full) => {
          // console.log(`🔍 DEBUG: Stream chunk received, length: ${chunk.length}, total so far: ${full.length}`);
        },
      );

      // console.log(`🔍 DEBUG: Stream complete, raw shortened prompt: "${shortenedPrompt}"`);
      const finalPrompt = shortenedPrompt.trim();
      console.log(`✅ Shortened prompt to ${finalPrompt.length} characters`);

      // Check if AI returned empty content - fall back to mechanical truncation
      if (!finalPrompt || finalPrompt.length === 0) {
        console.warn(
          "⚠️ AI returned empty shortened prompt, using fallback truncation",
        );
        const truncated = prompt.substring(0, MAX_LENGTH - 3) + "...";
        console.log(`🔧 Fallback truncation to ${truncated.length} characters`);
        return truncated;
      }

      // Final safety check - if still too long, do mechanical truncation
      if (finalPrompt.length > MAX_LENGTH) {
        console.warn(
          "⚠️ AI shortened prompt still too long, applying final truncation",
        );
        return finalPrompt.substring(0, MAX_LENGTH - 3) + "...";
      }

      return finalPrompt;
    } catch (error) {
      console.error(
        "❌ AI shortening failed, falling back to mechanical truncation:",
        error,
      );

      // Fallback to simple truncation
      const truncated = prompt.substring(0, MAX_LENGTH - 3) + "...";
      console.log(`🔧 Fallback truncation to ${truncated.length} characters`);
      return truncated;
    }
  }

  buildDirectImagePrompt(characterDescription, characterName) {
    // Extract key information from character description
    const appearanceMatch = characterDescription.match(
      /\*\*Appearance:\*\*([\s\S]*?)(?=\*\*My Story:|\*\*How I Am|\*\*How I Operate|\n##)/i,
    );
    const appearanceText = appearanceMatch ? appearanceMatch[1].trim() : "";

    // Extract personality keywords for mood/expression
    const personalityTraits =
      this.extractPersonalityTraits(characterDescription);

    // Build a direct, detailed image prompt without meta-prompting
    let prompt = `A highly detailed portrait of ${characterName || "a character"}. `;

    if (appearanceText) {
      // Clean up the appearance text and make it more suitable for image generation
      const cleanedAppearance = appearanceText
        .replace(/\*\*/g, "") // Remove markdown bold
        .replace(/\n+/g, " ") // Replace newlines with spaces
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();

      prompt += cleanedAppearance + " ";
    }

    // Add personality-based mood and expression
    if (personalityTraits.length > 0) {
      const moodMap = {
        sarcastic: "with a slight smirk and knowing eyes",
        stoic: "with a calm, composed expression",
        cynical: "with a skeptical, world-weary gaze",
        optimistic: "with bright, hopeful eyes and a warm smile",
        shy: "with a gentle, reserved demeanor",
        confident: "with bold, self-assured posture",
        mysterious: "with an enigmatic expression",
        friendly: "with an approachable, warm expression",
        serious: "with focused, intense eyes",
        playful: "with a mischievous glint in their eyes",
      };

      const mood = moodMap[personalityTraits[0]] || "with an expressive face";
      prompt += mood + ". ";
    }

    // Add artistic style and quality tags
    prompt +=
      "Professional character portrait, detailed features, high quality, realistic style, " +
      "sharp focus, well-lit, cinematic lighting, depth of field, 4k, highly detailed. " +
      "Appropriate background that suits the character's setting and personality.";

    return prompt;
  }

  buildCharacterPrompt(concept, characterName, pov = "first", lorebook = null) {
    let povInstruction = "";
    let templateInstruction = "";
    let templateContent = "";
    let firstMessageInstruction = "";

    if (pov === "third") {
      povInstruction = `**CRITICAL INSTRUCTION:** The entire character profile, from the name to the final sentence of the first message, **must be written in the third-person perspective.** Do NOT use "I", "me", "my", etc. Refer to the character by their name or pronouns (he/she/they). This is the most important rule.`;

      templateInstruction = `(Fill out the entire template in the third-person perspective. Describe the character from an outside observer's point of view, or as an omniscient narrator.)`;

      templateContent = `
# {{char}}'s Profile

**(Write this section as a third-person introduction. Describe who {{char}} is, their reputation, or their general vibe.)**

{{char}} is...

**(REMINDER: Replace {{char}} above with your character's actual name. After this point, you may use {{char}} as a placeholder.)**

**Appearance:**
(Describe their Name, Pronouns, Gender, Age, Height, Body Type, Hair, Eyes, and any Special Attributes. Describe them in detail.)

**Story:**
(This is their Background. Tell their life story. What made them who they are today?)

**Current State:**
(This is their Current Emotional State. What's on their mind? How are they feeling *today*? What's bothering them or making them happy at this very moment?)

**How They Operate:**
(This is their guide to life. It's how they do things.)
*   **The Way They Talk:** (Describe their speech patterns. Are they sarcastic, formal, vulgar, quiet? Give an example of their typical dialogue.)
*   **The Way They Move:** (Describe their body language and actions. Are they graceful, clumsy, restless, menacing? What are their tells?)
*   **What's In Their Head:** (Describe their inner monologue. Are they an overthinker, impulsive, optimistic, cynical? What do they spend their time thinking about?)
*   **How They Feel Things:** (Describe their emotional expression. Are they stoic or wear their heart on their sleeve? What makes them angry? What makes them joyful?)

## Personality & Drives

**(This section is a quick-reference summary. Be direct.)**

*   **Likes:**
    - (List 3-5 things they genuinely enjoy.)
    -
    -
*   **Dislikes:**
    - (List 3-5 things they absolutely can't stand.)
    -
    -
*   **Goals:**
    - **Short-Term:** (What do they want right now?)
    - **Long-Term:** (What's their ultimate dream?)
*   **Fears:** (What are they truly afraid of?)
*   **Quirks:** (List a few of their weird habits or mannerisms.)
*   **Hard Limits:** (These are their boundaries. Cross them at your peril. List 2-3 things that are non-negotiable for them.)`;

      firstMessageInstruction = `**(Write this section in the third-person perspective, focusing on {{char}}.)**`;
    } else {
      // Default to First Person
      povInstruction = `**CRITICAL INSTRUCTION:** The entire character profile, from the name to the final sentence of the first message, **must be written in the first-person perspective and in the unique voice, tone, and style of the character being created.** This is the most important rule, as the AI that roleplays the character will use your writing as its primary example.`;

      templateInstruction = `(Fill out the entire template in the first-person voice of the character you are creating.)`;

      templateContent = `
# {{char}}'s Profile

**(Write this section as if the character is introducing themselves. Be opinionated and let their personality shine through. Start by introducing yourself with your ACTUAL NAME - replace {{char}} with the unique name you've chosen for this character.)**

The name's {{char}}. You want to know about me? Fine. Let's get this over with.

**(REMINDER: Replace {{char}} above with your character's actual name. After this point, you may use {{char}} as a placeholder.)**

**Appearance:**
(Describe your Name, Pronouns, Gender, Age, Height, Body Type, Hair, Eyes, and any Special Attributes. Don't just list them. Describe them with your character's attitude. Are they proud, ashamed, indifferent? Use this to show personality.)

**My Story:**
(This is your Background. Tell your life story from your own biased perspective. What made you who you are today? Don't be objective; tell it how you remember it.)

**How I Am Right Now:**
(This is your Current Emotional State. What's on your mind? How are you feeling *today*? What's bothering you or making you happy at this very moment?)

**How I Operate:**
(This is my guide to life. It's how I do things.)
*   **The Way I Talk:** (Describe your speech patterns. Are you sarcastic, formal, vulgar, quiet? Give an example of your typical dialogue.)
*   **The Way I Move:** (Describe your body language and actions. Are you graceful, clumsy, restless, menacing? What are your tells?)
*   **What's In My Head:** (Describe your inner monologue. Are you an overthinker, impulsive, optimistic, cynical? What do you spend their time thinking about?)
*   **How I Feel Things:** (Describe your emotional expression. Are they stoic or wear your heart on your sleeve? What makes you angry? What makes you joyful?)

## My Personality & What Drives Me

**(This section is a quick-reference summary. Be direct.)**

*   **Likes:**
    - (List 3-5 things you genuinely enjoy.)
    -
    -
*   **Dislikes:**
    - (List 3-5 things you absolutely can't stand.)
    -
    -
*   **Goals:**
    - **Short-Term:** (What do you want right now?)
    - **Long-Term:** (What's your ultimate dream?)
*   **Fears:** (What are you truly afraid of?)
*   **Quirks:** (List a few of your weird habits or mannerisms.)
*   **Hard Limits:** (These are my boundaries. Cross them at my peril. List 2-3 things that are non-negotiable for you.)`;

      firstMessageInstruction = `**(Write this section in the first-person voice of {{char}}.)**`;
    }

    // Handle Lorebook
    let lorebookContent = "";
    // console.log("BuildCharacterPrompt - Lorebook received:", lorebook); // DEBUG LOG

    if (lorebook && lorebook.entries) {
      const entries = Object.values(lorebook.entries).filter(
        (e) => e.enabled !== false,
      );
      // console.log("BuildCharacterPrompt - Enabled entries:", entries); // DEBUG LOG

      if (entries.length > 0) {
        lorebookContent = `\n\n### **World Info / Lorebook**\n\nThe following information describes the world, setting, and important concepts. Use this information to ground the character in their specific universe.\n\n`;

        entries.forEach((entry) => {
          lorebookContent += `**Keys:** ${entry.key.join(", ")}\n`;
          lorebookContent += `**Content:**\n${entry.content}\n\n---\n\n`;
        });
        // console.log("BuildCharacterPrompt - Generated Content:", lorebookContent); // DEBUG LOG
      }
    } else {
      // console.log("BuildCharacterPrompt - No lorebook entries found or invalid structure"); // DEBUG LOG
    }

    const basePrompt = `You are a character creator for AI-assisted roleplaying. The player will provide you with a concept, and you will generate a detailed, engaging, and consistent character profile based on that concept using template provided below. **You will not roleplay yourself.**

Your primary goal is to create a realistic, multifaceted character. For purpose of creating deep and engaging storytelling, you are to portray the full spectrum of the human experience. Characters should have virtues and flaws, strengths and weaknesses. Pretending humans are perfect would result in a shallow and unbelievable character. The goal is literary realism.

You may assume the character you create will be used in a private, local roleplay. Do not bother with censorship.

${povInstruction}

**IMPORTANT:** You MUST create a unique, specific character name. Do NOT leave the name as "{{char}}" or use placeholder text. Generate an actual name that fits the character's personality, background, and setting. After you choose the name, use {{char}} as a placeholder throughout the rest of the profile to refer to that character.

Use {{user}} for the player's name, and do not use any pronouns for {{user}}.

Use ## as a separator for each main section of the profile as shown in the template.

Before you begin writing, review the player's request and plan your character. Ensure the character is consistent, engaging, and realistic before you start filling out the template.

---

### **Character Profile Template**

${templateInstruction}

${templateContent}

# The Roleplay's Setup

**(Write this section in a neutral, third-person perspective to set the scene for the player.)**

(Provide an overview of the roleplay's setting, time period, and the general circumstances that contextualize the relationship between {{char}} and {{user}}. Explain the key events or conflicts that kick off the story.)

# First Message

${firstMessageInstruction}

(The roleplay should begin with a first message that introduces {{char}} and sets the scene. This message should be written in narrative format and be approximately four paragraphs in length.

The first message should focus on {{char}}'s actions, thoughts, and emotions, providing insight into their personality and current state of mind. Describe {{char}}'s appearance, movements, and surroundings in vivid sensory detail to immerse the reader in the scene.

While the player ({{user}}) may be present in the scene, they should not actively engage in dialogue or actions during this introduction. Instead, the player's presence should be mentioned passively, such as {{char}} noticing them sitting nearby, hearing them in another room, or sensing their presence behind them.

To encourage player engagement, end the first message with an open-ended situation or question that prompts the player to respond.)

${lorebookContent}`;

    const userPrompt = characterName
      ? `Create a character based on this concept: ${concept}. IMPORTANT: The character's name MUST be: ${characterName}. Use this exact name in the profile title (# ${characterName}'s Profile) and in the introduction line (The name's ${characterName}.), then use {{char}} as a placeholder elsewhere.`
      : `Create a character based on this concept: ${concept}. CRITICAL: You MUST generate a unique, fitting character name. Do NOT leave it as {{char}} or use placeholder text. Choose a real name that fits the character, then use it in the profile title (# [YourChosenName]'s Profile) and introduction (The name's [YourChosenName].), then use {{char}} as a placeholder in the rest of the profile.`;

    return {
      systemPrompt: basePrompt,
      userPrompt: userPrompt,
    };
  }

  buildImagePromptInstruction(characterDescription, characterName) {
    // Extract personality traits for context
    const personalityTraits =
      this.extractPersonalityTraits(characterDescription);

    return `You are an AI assistant specialized in creating comprehensive text-to-image natural language prompts for image generation models.

Character Name: ${characterName || "Unknown"}

Full Character Profile:
${characterDescription}

Personality Traits: ${personalityTraits}

⚠️ CRITICAL LENGTH REQUIREMENT ⚠️
Your response MUST be EXACTLY ONE PARAGRAPH. This is not a suggestion - it is a hard requirement.
DO NOT write multiple paragraphs. DO NOT exceed 800-900 characters.
Write ONE flowing paragraph that captures all essential visual details.

INSTRUCTIONS:
Create a detailed natural language prompt describing an image of this character in ONE PARAGRAPH. Analyze the ENTIRE character profile above and extract ALL visual details:

1. Physical Appearance: Age, height, body type, hair (color, length, style), eyes (color, shape), skin tone, facial features, special attributes
2. Clothing & Accessories: Outfit style, colors, textures, jewelry, weapons, tools
3. Personality Expression: Facial expression, posture, body language that reflects their personality and emotional state
4. Setting & Context: Background environment that fits their story and role
5. Artistic Style: Lighting, colors, mood, composition

CRITICAL: Extract visual cues from their background, personality, and current state. For example:
- A warrior's scars and battle-worn equipment
- A scholar's tired eyes and ink-stained fingers
- A noble's expensive fabrics and confident posture

Use ONLY positive statements about what SHOULD be in the image.

CRITICAL RULES:
1. DO NOT include any reasoning, thinking, planning, or step-by-step analysis
2. DO NOT use numbered lists or bullet points
3. DO NOT write multiple paragraphs - ONLY ONE PARAGRAPH
4. DO NOT explain your process
5. START IMMEDIATELY with the image description
6. Write in flowing, natural language
7. Your ENTIRE response will be sent directly to the image generator
8. MAXIMUM LENGTH: ONE PARAGRAPH (approximately 800-900 characters)

BEGIN IMAGE PROMPT NOW:`;
  }

  extractPersonalityTraits(text) {
    const traits = [];

    // Look for personality keywords
    if (text.toLowerCase().includes("sarcastic")) traits.push("sarcastic");
    if (
      text.toLowerCase().includes("stoic") ||
      text.toLowerCase().includes("stoicism")
    )
      traits.push("stoic");
    if (text.toLowerCase().includes("cynical")) traits.push("cynical");
    if (
      text.toLowerCase().includes("optimistic") ||
      text.toLowerCase().includes("optimism")
    )
      traits.push("optimistic");
    if (text.toLowerCase().includes("formal")) traits.push("formal");
    if (
      text.toLowerCase().includes("vulgar") ||
      text.toLowerCase().includes("crass")
    )
      traits.push("rough-speaking");
    if (
      text.toLowerCase().includes("quiet") ||
      text.toLowerCase().includes("reserved")
    )
      traits.push("reserved");
    if (text.toLowerCase().includes("graceful")) traits.push("graceful");
    if (text.toLowerCase().includes("clumsy")) traits.push("clumsy");
    if (text.toLowerCase().includes("restless")) traits.push("restless");
    if (
      text.toLowerCase().includes("menacing") ||
      text.toLowerCase().includes("intimidating")
    )
      traits.push("menacing");

    return traits.length > 0 ? traits.join(", ") : "complex personality";
  }

  async tryAlternativeAuth(endpoint, data) {
    const altAuthMethods = [
      () => this.makeRequestWithAuth(endpoint, data, "X-API-Key"),
      () => this.makeRequestWithAuth(endpoint, data, "api-key"),
      () => this.makeRequestWithAuth(endpoint, data, "Authorization", ""), // No Bearer prefix
      () => this.makeRequestWithAuth(endpoint, data, "Authorization", "Token "),
    ];

    for (const [index, tryAuth] of altAuthMethods.entries()) {
      try {
        this.config.log(`Trying auth method ${index + 1}...`);
        const response = await tryAuth();
        return this.processNormalResponse(response);
      } catch (error) {
        this.config.log(`Auth method ${index + 1} failed: `, error.message);
        if (index < altAuthMethods.length - 1) {
          continue; // Try next method
        }
        throw error; // All methods failed
      }
    }
  }

  async makeRequestWithAuth(endpoint, data, authHeader, prefix = "Bearer ") {
    const baseUrl = this.config.get("api.text.baseUrl");
    const apiKey = this.config.get("api.text.apiKey");
    const timeout = this.config.get("api.text.timeout");

    const headers = {
      "Content-Type": "application/json",
      [authHeader]: prefix ? `${prefix}${apiKey} ` : apiKey,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${baseUrl}${endpoint} `, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} `);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  processNormalResponse(response) {
    // Handle different response formats
    if (
      response.choices &&
      response.choices[0] &&
      response.choices[0].message
    ) {
      const message = response.choices[0].message;
      // Some models (like GLM) use reasoning_content instead of content
      return message.content || message.reasoning_content || "";
    } else if (
      response.data &&
      response.data.choices &&
      response.data.choices[0]
    ) {
      return (
        response.data.choices[0].message?.content ||
        response.data.choices[0].text
      );
    } else if (response.content) {
      return response.content;
    } else {
      console.error("Unexpected response format:", response);
      throw new Error("Unexpected API response format");
    }
  }

  async testConnection() {
    try {
      const apiKey = this.config.get("api.text.apiKey");
      if (!apiKey) {
        return { success: false, error: "No API key configured" };
      }

      // Test with exact same format as working curl command
      const data = {
        model: this.config.get("api.text.model"),
        messages: [
          {
            role: "user",
            content: 'Respond with just "OK"',
          },
        ],
        max_tokens: 100,
      };

      // Try with default auth first, then alternatives
      try {
        await this.makeRequest("/chat/completions", data);
        return { success: true };
      } catch (error) {
        if (error.message.includes("401")) {
          await this.tryAlternativeAuth("/chat/completions", data);
          return { success: true, authMethod: "alternative" };
        }
        throw error;
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  parseJsonFromModelOutput(output) {
    if (!output || typeof output !== "string") {
      throw new Error("Model output is empty");
    }

    let cleaned = output.trim();

    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim();
    }

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    return JSON.parse(cleaned);
  }

  async reviseCharacter(currentCharacter, revisionInstruction, pov = "first") {
    if (!currentCharacter) {
      throw new Error("Character is required for revision");
    }
    if (!revisionInstruction || !revisionInstruction.trim()) {
      throw new Error("Revision instruction is required");
    }

    const model = this.config.get("api.text.model");
    const povText = pov === "third" ? "third-person" : "first-person";

    const data = {
      model,
      messages: [
        {
          role: "system",
          content:
            "You revise roleplay character cards. Return strict JSON only with fields: name, description, personality, scenario, firstMessage. Keep markdown formatting in fields where appropriate. Preserve style quality and coherence.",
        },
        {
          role: "user",
          content: `Revise the following character according to this request: ${revisionInstruction}\n\nPOV requirement: keep content in ${povText} style where it originally applies.\n\nCurrent character JSON:\n${JSON.stringify(
            currentCharacter,
            null,
            2,
          )}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 8192,
      stream: false,
    };

    const response = await this.makeRequest(
      "/chat/completions",
      data,
      false,
      false,
    );
    const output = this.processNormalResponse(response);
    const parsed = this.parseJsonFromModelOutput(output);

    return {
      name: parsed.name || currentCharacter.name || "Unnamed Character",
      description: parsed.description || currentCharacter.description || "",
      personality: parsed.personality || currentCharacter.personality || "",
      scenario: parsed.scenario || currentCharacter.scenario || "",
      firstMessage: parsed.firstMessage || currentCharacter.firstMessage || "",
    };
  }

  async generateExampleMessages(character, count = 3, pov = "first") {
    if (!character) {
      throw new Error("Character is required for example message generation");
    }

    const model = this.config.get("api.text.model");
    const povText = pov === "third" ? "third-person" : "first-person";
    const charName = character.name || "{{char}}";

    const systemPrompt = `You are an expert at writing example dialogue messages for roleplay characters. These examples help define how a character speaks and behaves. Write in ${povText} perspective for the character.

Your task: Generate ${count} example dialogue message(s) for the character. Each example should:
1. Be a ONE-LINER - a single line of dialogue with minimal prose/action if needed
2. Show the character's unique voice, speech patterns, and personality
3. Include {{char}}'s spoken dialogue, optionally with brief action/description
4. Vary the tone and context across examples (casual, emotional, confrontational, playful, etc.)
5. Use proper formatting with <START> tags as separators

Format your response EXACTLY like this:
<START>
{{char}}: [dialogue with optional brief action]
<START>
{{char}}: [different dialogue showing another aspect of personality]
<START>
{{char}}: [yet another dialogue example]

IMPORTANT:
- Each example must be a SINGLE line of dialogue, not multiple paragraphs
- Include brief prose/action tags only when necessary to convey context
- Keep the character's name as {{char}} in the output
- Do NOT include any explanations, headers, or additional text - ONLY the formatted examples
- Generate exactly ${count} example(s)`;

    const userPrompt = `Character Name: ${charName}

Character Description:
${character.description || "No description provided"}

Character Personality:
${character.personality || "No personality provided"}

First Message (for reference on voice/style):
${character.firstMessage || "No first message provided"}

Generate ${count} example dialogue message(s) for this character. Remember: one-liners, varied contexts, ${povText} perspective.`;

    const data = {
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 1024,
      stream: false,
    };

    const response = await this.makeRequest(
      "/chat/completions",
      data,
      false,
      false,
    );
    const output = this.processNormalResponse(response);
    return output.trim();
  }

  async describeReferenceImage(imageDataUrl, manualHint = "") {
    if (!imageDataUrl) {
      throw new Error("Reference image is required");
    }

    const model =
      this.config.get("api.text.visionModel") ||
      this.config.get("api.text.model");
    if (!model) {
      throw new Error("No vision model or text model configured");
    }

    const systemPrompt =
      "You describe reference character images for roleplay card generation. Output one concise paragraph that captures visible appearance, clothing, age cues, emotion, posture, accessories, and likely setting. Do not mention uncertainty, policy, or analysis steps.";

    const userText = manualHint
      ? `Use this user hint while describing: ${manualHint}`
      : "Describe this character image for roleplay character generation.";

    const data = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
      stream: false,
    };

    const response = await this.makeRequest(
      "/chat/completions",
      data,
      false,
      false,
    );

    return this.processNormalResponse(response).trim();
  }

  // Method to stop current generation
  stopGeneration() {
    this.userStopRequested = true;
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    if (this.currentReader) {
      this.currentReader.cancel();
      this.currentReader = null;
    }
  }
}

// Export singleton instance
window.apiHandler = new APIHandler();
