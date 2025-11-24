// Character Generator Module
class CharacterGenerator {
  constructor() {
    this.apiHandler = null; // Will be set lazily
    this.rawCharacterData = "";
    this.parsedCharacter = null;
  }

  // Lazy getter for apiHandler to avoid circular dependency
  get apiHandlerInstance() {
    if (!this.apiHandler) {
      this.apiHandler = window.apiHandler;
    }
    return this.apiHandler;
  }

  async generateCharacter(concept, characterName, onStream = null, pov = "first", lorebook = null) {
    try {
      this.rawCharacterData = await this.apiHandlerInstance.generateCharacter(
        concept,
        characterName,
        onStream,
        pov,
        lorebook
      );
      this.parsedCharacter = this.parseCharacterData(this.rawCharacterData);
      return this.parsedCharacter;
    } catch (error) {
      console.error("Error generating character:", error);
      throw error;
    }
  }

  // Parse character data using simple string splitting based on template
  parseCharacterData(rawData) {
    const character = {
      name: "",
      description: "",
      personality: "",
      scenario: "",
      firstMessage: "",
    };

    // Extract character name from profile section
    // Try standard header format first: # Name's Profile
    const nameMatch = rawData.match(/^#\s*([^'\\]*(?:\\.[^'\\]*)*)'s Profile/i);
    if (nameMatch) {
      character.name = nameMatch[1].trim();
    } else {
      // Try to find name in text (First Person: "The name's Name")
      const nameTextMatch = rawData.match(/The name's\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/);
      if (nameTextMatch) {
        character.name = nameTextMatch[1].trim();
      } else {
        // Try Third Person: "Name is..." (at start of description)
        const thirdPersonMatch = rawData.match(/^(?:#\s*[^#\n]+\n+)?([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+is\b/m);
        if (thirdPersonMatch) {
          character.name = thirdPersonMatch[1].trim();
        }
      }
    }

    // Fallback if name is still missing but we have content
    if (!character.name) {
      console.warn("Could not extract character name. Using default.");
      character.name = "{{char}}";
    }

    // Extract description section (everything from start or # Profile to ## Personality)
    // More robust regex that doesn't strictly require the # Profile header
    const descriptionMatch = rawData.match(
      /(?:#\s*[^#]+?'s Profile[\s\S]*?)?([\s\S]*?)(?=##\s*(?:My\s+)?Personality)/i,
    );
    if (descriptionMatch) {
      // If we captured the header in the group, it's fine. If not, we prepend it if we have a name.
      let descContent = descriptionMatch[1].trim();

      // Clean up potential leading newlines or markdown artifacts
      descContent = descContent.replace(/^#\s*[^#\n]+\n+/, "").trim();

      if (character.name && character.name !== "Unknown Character") {
        character.description = `# ${character.name}'s Profile\n\n${descContent}`;
      } else {
        character.description = descContent;
      }
    }

    // Extract personality section (include the title)
    const personalityMatch = rawData.match(
      /(##\s*(?:My\s+)?Personality[\s\S]*?)(?=#\s*The Roleplay|$)/i,
    );
    if (personalityMatch) {
      character.personality = personalityMatch[1].trim();
    }

    // Extract scenario section (include the title)
    const scenarioMatch = rawData.match(
      /(#\s*The Roleplay's Setup[\s\S]*?)(?=#\s*First Message|$)/i,
    );
    if (scenarioMatch) {
      character.scenario = scenarioMatch[1].trim();
    } else {
      // Create a default scenario if not found
      character.scenario = `A roleplay featuring ${character.name}. The setting and circumstances evolve naturally through interaction between ${character.name} and {{user}}.`;
    }

    // Extract first message (no title, just the content)
    const firstMessageMatch = rawData.match(
      /#\s*First Message\s*\n\n([\s\S]+?)$/i,
    );
    if (firstMessageMatch) {
      character.firstMessage = firstMessageMatch[1].trim();
    } else {
      // Try with single newline
      const firstMessageMatchAlt = rawData.match(
        /#\s*First Message\s*\n([\s\S]+?)$/i,
      );
      if (firstMessageMatchAlt) {
        character.firstMessage = firstMessageMatchAlt[1].trim();
      }
    }

    return character;
  }

  // Format character for display
  formatCharacterForDisplay(character) {
    return `
            <div class="character-section">
                <strong>Name:</strong> ${character.name}
            </div>
            <div class="character-section">
                <strong>Description:</strong><br>
                ${character.description.replace(/\n/g, "<br>")}
            </div>
            <div class="character-section">
                <strong>Personality:</strong><br>
                ${character.personality.replace(/\n/g, "<br>")}
            </div>
            <div class="character-section">
                <strong>Scenario:</strong><br>
                ${character.scenario.replace(/\n/g, "<br>")}
            </div>
            <div class="character-section">
                <strong>First Message:</strong><br>
                <div class="message-example">
                    ${character.firstMessage.replace(/\n/g, "<br>")}
                </div>
            </div>
        `;
  }

  // Convert to SillyTavern Spec V2 format
  toSpecV2Format(character) {
    return {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: character.name || "Unnamed Character",
        description: character.description || "",
        personality: character.personality || "",
        scenario: character.scenario || "",
        first_mes: character.firstMessage || "Hello!",
        mes_example: "",
        tags: [],
      },
    };
  }
}

// Export singleton instance
window.characterGenerator = new CharacterGenerator();
