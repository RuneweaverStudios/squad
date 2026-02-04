# Media and image generation

JAT includes image generation tools powered by the Google Gemini API. They handle text-to-image generation, image editing, multi-image composition, and agent avatar creation.

## Prerequisites

All media tools require a `GEMINI_API_KEY` environment variable. Set it in the IDE under Settings > API Keys > Google, or export it directly:

```bash
export GEMINI_API_KEY="AIza..."
```

## Tools overview

| Tool | Purpose |
|------|---------|
| `gemini-image` | Generate an image from a text prompt |
| `gemini-edit` | Edit an existing image with a text prompt |
| `gemini-compose` | Combine 2-14 images into one |
| `avatar-generate` | Generate a unique agent avatar |
| `avatar-to-ansi` | Convert an avatar image to terminal ANSI art |
| `gemini-lib.sh` | Shared helper functions for Gemini API calls |

## gemini-image

Generates an image from a text description. The simplest of the bunch.

```bash
gemini-image "A minimalist logo for a task management tool, blue and white, flat design"
```

Output is saved to a file path that gets printed to stdout. You can specify the output location:

```bash
gemini-image "Mountain landscape at sunset" --output /tmp/landscape.png
```

## gemini-edit

Takes an existing image and modifies it based on a text prompt. Good for iterating on designs or making targeted changes.

```bash
gemini-edit /tmp/landscape.png "Add a small cabin in the foreground"
```

The original image stays untouched. The edited version gets saved to a new file.

## gemini-compose

Combines multiple images into a single composition. Accepts 2-14 input images and arranges them based on your prompt.

```bash
gemini-compose image1.png image2.png image3.png "Arrange these as a triptych with subtle borders"
```

This is useful for creating before/after comparisons, collages, or documentation screenshots.

## avatar-generate

Generates unique avatar images for agents. The IDE uses this to create distinctive visual identities for each agent in the dashboard.

```bash
avatar-generate "WisePrairie"
```

Each agent name produces a deterministic style seed so the avatar feels consistent with the agents personality. Avatars are stored and displayed in the IDE's agent cards.

## avatar-to-ansi

Converts an avatar image into ANSI art for terminal display. This lets agents show their avatar in the terminal statusline.

```bash
avatar-to-ansi /path/to/avatar.png
```

The output uses ANSI color codes and Unicode block characters to render a low-resolution version of the image directly in the terminal.

## Shared library

The `gemini-lib.sh` file contains shared helper functions used by all Gemini tools:

- API request formatting
- Response parsing
- Error handling
- Image encoding/decoding

You dont call this file directly. Its sourced by the other tools.

## Integration with the IDE

The IDE uses media tools in two places:

- **Agent avatars** - Generated automatically when a new agent registers. Shows in agent cards and the dashboard.
- **Task attachments** - Agents can generate and attach images to tasks during verification.

AI features fall back gracefully if no Gemini key is configured. The IDE works fine without image generation, you just wont see agent avatars or AI-generated images.

## See also

- [Credentials & Secrets](/docs/credentials/) - Setting up the Gemini API key
- [Sessions & Agents](/docs/sessions/) - Agent identity and avatars
- [CLI Reference](/docs/cli-reference/) - Full command reference
