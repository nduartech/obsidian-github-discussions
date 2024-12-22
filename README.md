# Obsidian Github Discussions

A plugin for Obsidian that enables bi-directional syncing between your Obsidian vault and Github Discussions. Perfect for managing a blog or documentation using Obsidian while publishing to Github Discussions. When used with the [github-discussions-blog-loader](https://github.com/mattbrailsford/github-discussions-blog-loader) for Astro, you get a complete blog publishing workflow: write in Obsidian, sync to Github Discussions, and automatically publish to your Astro-powered website!

## Features

- **Two-way Sync**: Upload your Obsidian markdown files to Github Discussions and download Github Discussions back to your vault
- **Frontmatter Support**: Maintains metadata including tags, series, publication dates, and descriptions
- **Label Management**: Automatically creates and manages Github labels for tags and series
- **Granular Control**: Choose what to sync with confirmation dialogs for:
  - Creating new discussions
  - Updating frontmatter and labels
  - Updating discussion content
- **Make.md Compatibility**: Optional support for Make.md plugin

## Installation

1. In Obsidian, go to Settings > Community Plugins
2. Disable Safe Mode
3. Click "Browse" and search for "Github Discussions"
4. Install the plugin
5. Enable the plugin in your list of installed plugins

## Configuration

### Required Settings

1. **Github Token**: Set an environment variable named `OGD_GITHUB_TOKEN` with your Github Personal Access Token
   - Token needs permissions for: `read:org`, `repo`, `write:discussion`
   - [How to create a Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)

2. **Plugin Settings**:
   - **Blog Articles Directory**: Select the folder containing your blog posts
   - **Repo Owner**: Your Github username or organization name
   - **Repo Name**: The repository where discussions will be created/updated

### Optional Settings

- **Make MD Plugin Installed**: Toggle if you're using the Make.md plugin
- **Blog Post Category**: Name of the Github Discussions category (default: "Blog Posts")
- **Draft Label**: Label for draft posts (default: "state/draft")
- **Tag Label Prefix**: Prefix for tag labels (default: "tag/")
- **Series Label Prefix**: Prefix for series labels (default: "series/")

## Usage

### Required Frontmatter

Each markdown file needs at least the following frontmatter:

```yaml
---
slug: unique-post-identifier
published: MM/DD/YYYY
description: A brief description of your post
tags: [optional, tags]
series: optional-series-name
---
```

### Uploading to Github

1. Click the "Upload" icon (arrow up) in the left ribbon
2. Confirm when prompted to:
   - Create new discussions for new files
   - Update frontmatter and labels for existing discussions
   - Update content for existing discussions

### Downloading from Github

1. Click the "Download" icon (arrow down) in the left ribbon
2. Confirm when prompted to:
   - Create new files for new discussions
   - Update frontmatter in existing files
   - Update content in existing files

## How It Works

- The plugin matches files and discussions using the `slug` in frontmatter
- When uploading:
  - New files become new discussions
  - Tags become Github labels with your configured prefix
  - Series become Github labels with your configured prefix
  - All metadata is stored in the discussion's frontmatter
- When downloading:
  - New discussions become new files
  - Github labels are converted back to tags and series
  - Frontmatter and content can be selectively updated

## Notes

- Ensure your Github repository has Discussions enabled
- Create your desired Discussion category before using the plugin
- The plugin respects existing file structures and won't override files without confirmation
- Labels in Github Discussions are replaced, not just added, to ensure sync accuracy

## Development

This plugin is open source. To contribute:

1. Clone the repository
2. Run `npm install`
3. Run `npm run dev` to start compilation in watch mode
4. Create a symbolic link from the repository to your Obsidian plugins folder

## Support

If you encounter any issues or have suggestions:

1. Check the existing issues on Github
2. Create a new issue with:
   - A clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Your Obsidian and plugin versions

## License

MIT License - see LICENSE file for details

## Changelog

### 1.0.0
- Initial release
- Basic upload/download functionality
- Frontmatter and label syncing
- Make.md compatibility

## Acknowledgements

Thanks to all contributors and the Obsidian community for feedback and support.

This plugin is designed to work in conjunction with [github-discussions-blog-loader](https://github.com/mattbrailsford/github-discussions-blog-loader), an Astro content loader that lets you publish Github Discussion posts to your website! Together, these tools form a complete workflow: write in Obsidian, sync to Github Discussions, and publish to your Astro-powered website.
