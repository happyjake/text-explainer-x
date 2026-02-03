# Text Explainer X

A browser userscript that explains selected text using LLM with follow-up chat, web search, and Anki integration.

## Features

- **Text Explanation**: Select any text and get instant explanations
  - Single words: Definition, pronunciation (IPA), context, example sentences
  - Phrases/sentences: Translation with tone preservation
  - Long text (500+ words): Structured summary with key points
- **Follow-up Chat**: Ask follow-up questions about the explanation
- **Web Search**: Integrated search via Brave, Kagi, or Tavily for current information
- **Anki Integration**: Save vocabulary and knowledge as flashcards
- **Multi-provider LLM Support**: OpenRouter, OpenAI, Anthropic, Gemini
- **Customizable**: Keyboard shortcuts, floating button, response language

## Installation

1. Install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Safari, Edge)
   - [Violentmonkey](https://violentmonkey.github.io/) (Chrome, Firefox)

2. Install the script:
   - **[Install from Greasyfork](https://greasyfork.org/en/scripts/565006-text-explainer-x)** (recommended)
   - Or install directly from this repo: [text-explainer-x.user.js](./text-explainer-x.user.js)

## Configuration

Click the Tampermonkey icon and select "Text Explainer Settings" to configure:

| Setting | Description |
|---------|-------------|
| Provider | LLM provider (OpenRouter, OpenAI, Anthropic, Gemini) |
| Model | Model name (e.g., `openai/gpt-4o-mini`) |
| Base URL | API endpoint URL |
| API Key | Your API key for the provider |
| Search | Web search provider (Brave, Kagi, Tavily) + API key |
| Anki | AnkiConnect endpoint URL + API key |
| Language | Response language (Chinese, English, Japanese, etc.) |
| Shortcut | Keyboard shortcut (default: Alt+D) |
| Float Btn | Floating button for touch devices |

## Usage

1. Select text on any webpage
2. Press `Alt+D` (or your configured shortcut)
3. View the explanation in the popup
4. Ask follow-up questions or add to Anki

## Credits

- Original script: [Text Explainer](https://greasyfork.org/en/scripts/528810-text-explainer) by [RoCry](https://greasyfork.org/en/users/1412785-tian-xia-rocry)
- Enhanced version with follow-up chat, web search, and Anki integration

## License

MIT License
