import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	parseYaml,
	Plugin,
	PluginSettingTab,
	Setting,
	stringifyYaml,
	TFile,
	TFolder
} from 'obsidian';
import {githubClient} from './client';
import type {GitHubPost, GitHubClientOptions} from './types';
import {
	SEARCH_POSTS_QUERY,
	CREATE_DISCUSSION_MUTATION,
	UPDATE_DISCUSSION_MUTATION,
	CREATE_LABEL_MUTATION,
	ADD_LABELS_TO_DISCUSSION,
	GET_REPOSITORY_INFO
} from './graphql';
import slugify from "slugify";

// Remember to rename these classes and interfaces!
const GITHUB_TOKEN = process.env.OGD_GITHUB_TOKEN;

function convertDateFormatToObsidian(dateStr: string) {
	// Split the date string into parts
	const [year, month, day] = dateStr.split('-');

	// Return the reformatted date
	return `${month}/${day}/${year}`;
}

function convertDateFormatToGH(dateStr: string) {
	// Split the date string into parts
	const [month, day, year] = dateStr.split('/');

	// Return the reformatted date
	return `${year}-${month}-${day}`;
}

interface OGDSettings {
	articlesDir: string;
	makeMd: boolean;
	owner: string;
	repo: string;
	blogPostCategory: string;
	draftLabel: string;
	tagLabelPrefix: string;
	seriesLabelPrefix: string;
}

const DEFAULT_SETTINGS: OGDSettings = {
	articlesDir: 'Blog',
	makeMd: false,
	owner: "",
	repo: "",
	blogPostCategory: "Blog Posts",
	draftLabel: "state/draft",
	tagLabelPrefix: "tag/",
	seriesLabelPrefix: "series/",
}

async function executeGitHubGraphQL(query: string, variables: any, token: string) {
	const response = await fetch('https://api.github.com/graphql', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			query,
			variables,
		}),
	});

	const result = await response.json();
	if (result.errors) {
		throw new Error(result.errors[0].message);
	}
	return result.data;
}

async function createOrUpdateLabels(
	repoId: string,
	existingLabels: Map<string, string>,
	labelNames: string[],
	token: string
): Promise<Map<string, string>> {
	const labelIds = new Map<string, string>();

	for (const labelName of labelNames) {
		if (existingLabels.has(labelName)) {
			labelIds.set(labelName, existingLabels.get(labelName)!);
			continue;
		}

		const result = await executeGitHubGraphQL(
			CREATE_LABEL_MUTATION,
			{
				repositoryId: repoId,
				name: labelName,
				description: labelName.startsWith('series/') ? labelName.replace('series/', '') : undefined
			},
			token
		);

		labelIds.set(labelName, result.createLabel.label.id);
	}

	return labelIds;
}

/**
 * Fetches GitHub Discussions for a specified repository
 * @param auth - GitHub authentication token
 * @param username - GitHub username/organization
 * @param repo - Repository name
 * @param options - Optional configuration for filtering discussions
 * @returns Promise<GitHubPost[]> - Array of GitHub discussions
 */
async function fetchGithubDiscussions(
	auth: string,
	username: string,
	repo: string,
	options: {
		blogPostCategory?: string,
		draftLabel?: string,
		tagLabelPrefix?: string,
		seriesLabelPrefix?: string,
		lastModified?: string
	} = {}
): Promise<GitHubPost[]> {
	// Validate inputs
	if (!auth) throw new Error('GitHub authentication token is required');
	if (!username) throw new Error('GitHub username is required');
	if (!repo) throw new Error('Repository name is required');

	// Create client options
	const clientOptions: GitHubClientOptions = {
		auth,
		repo: {
			owner: username,
			name: repo
		},
		mappings: {
			blogPostCategory: options.blogPostCategory,
			draftLabel: options.draftLabel,
			tagLabelPrefix: options.tagLabelPrefix || 'tag/',
			seriesLabelPrefix: options.seriesLabelPrefix || 'series/'
		}
	};

	try {
		// Initialize the GitHub client
		const client = githubClient(clientOptions);

		// Fetch all posts
		const posts = await client.getAllPosts(options.lastModified);

		return posts;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to fetch GitHub discussions: ${error.message}`);
		}
		throw new Error('Failed to fetch GitHub discussions');
	}
}

export default class ObsidianGithubDiscussions extends Plugin {
	settings: OGDSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('arrow-up', 'Upload Blog to Github Discussions', this.upload());
		// This creates an icon in the left ribbon.
		const ribbonIconElDown = this.addRibbonIcon('arrow-down', 'Download Blog from Github Discussions', await this.download());
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');
		ribbonIconElDown.addClass('my-plugin-ribbon-class');

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new OGDSettingsTab(this.app, this));
	}

	private upload() {
    return async (evt: MouseEvent) => {
        const passing = await this.checkSettings();
        if (!passing) return;

        try {
            // Get repository info
            const repoInfo = await executeGitHubGraphQL(
                GET_REPOSITORY_INFO,
                {
                    owner: this.settings.owner,
                    name: this.settings.repo
                },
                GITHUB_TOKEN!
            );

            const repoId = repoInfo.repository.id;
            const categoryId = repoInfo.repository.discussionCategories.nodes
                .find((cat: any) => cat.name === this.settings.blogPostCategory)?.id;

            if (!categoryId) {
                new Notice(`Category '${this.settings.blogPostCategory}' not found in repository`);
                return;
            }

            // Create a map of existing labels
            const existingLabels = new Map(
                repoInfo.repository.labels.nodes.map((label: any) => [label.name, label.id])
            );

            // Get existing discussions for comparison
            const ghArticles = await fetchGithubDiscussions(
                GITHUB_TOKEN!,
                this.settings.owner,
                this.settings.repo,
                {
                    blogPostCategory: this.settings.blogPostCategory,
                    draftLabel: this.settings.draftLabel,
                    tagLabelPrefix: this.settings.tagLabelPrefix,
                    seriesLabelPrefix: this.settings.seriesLabelPrefix
                }
            );

            // Process markdown files
            let markdownFiles = this.app.vault.getMarkdownFiles()
                .filter(file => file.path.startsWith(this.settings.articlesDir + "/"));

            if (this.settings.makeMd) {
                const filename = this.settings.articlesDir.split("/").last() + ".md";
                markdownFiles = markdownFiles.filter(file => file.name !== filename);
            }

            // Find new files to create discussions for
            const newFiles: { file: TFile; frontMatter: any; sections: string[]; }[] = [];
            const existingFiles: { file: TFile; frontMatter: any; sections: string[]; }[] = [];

            for (const file of markdownFiles) {
                const content = await this.app.vault.read(file);
                const sections = content.split("---");
                if (sections.length < 3) continue;

                const frontMatter = parseYaml(sections[1]);
                if (!frontMatter.slug) continue;

                const existingPost = ghArticles.find(post => {
                    const postFrontMatter = parseYaml(post.body.split("---")[1]);
                    return postFrontMatter.slug === frontMatter.slug;
                });

                if (existingPost) {
                    existingFiles.push({ file, frontMatter, sections });
                } else {
                    newFiles.push({ file, frontMatter, sections });
                }
            }

            // Handle new files
            if (newFiles.length > 0) {
                new OGDModal(this.app, `Create ${newFiles.length} new discussions from local files?`, async (result) => {
                    if (result) {
                        for (const { file, frontMatter, sections } of newFiles) {
                            const body = sections[2].trim();
                            const labels: string[] = [];
                            if (frontMatter.tags) {
                                labels.push(...frontMatter.tags.map((tag: string) =>
                                    `${this.settings.tagLabelPrefix}${tag}`
                                ));
                            }
                            if (frontMatter.series) {
                                labels.push(`${this.settings.seriesLabelPrefix}${frontMatter.series}`);
                            }

                            // Create or update labels
							//@ts-ignore
                            const labelIds = await createOrUpdateLabels(repoId, existingLabels, labels, GITHUB_TOKEN!);

                            // Prepare frontmatter for GitHub
                            const githubFrontMatter = {
                                slug: frontMatter.slug,
                                description: frontMatter.description,
                                published: convertDateFormatToGH(frontMatter.published)
                            };

                            // Create discussion content
                            const discussionBody = `---\n${stringifyYaml(githubFrontMatter)}---\n${body}`;

                            // Create new discussion
                            const result = await executeGitHubGraphQL(
                                CREATE_DISCUSSION_MUTATION,
                                {
                                    repositoryId: repoId,
                                    categoryId: categoryId,
                                    title: file.basename,
                                    body: discussionBody
                                },
                                GITHUB_TOKEN!
                            );

                            // Add labels to new discussion
                            await executeGitHubGraphQL(
                                ADD_LABELS_TO_DISCUSSION,
                                {
                                    labelableId: result.createDiscussion.discussion.id,
                                    labelIds: Array.from(labelIds.values())
                                },
                                GITHUB_TOKEN!
                            );
                        }
                        new Notice(`Created ${newFiles.length} new discussions`);
                    }
                }).open();
            }

            // Handle existing files
            if (existingFiles.length > 0) {
                // Prompt for frontmatter and label updates
                new OGDModal(this.app, "Would you like to update frontmatter and labels in GitHub Discussions?", async (result) => {
                    if (result) {
                        for (const { file, frontMatter } of existingFiles) {
                            const existingPost = ghArticles.find(post => {
                                const postFrontMatter = parseYaml(post.body.split("---")[1]);
                                return postFrontMatter.slug === frontMatter.slug;
                            });

                            if (existingPost) {
                                const labels: string[] = [];
                                if (frontMatter.tags) {
                                    labels.push(...frontMatter.tags.map((tag: string) =>
                                        `${this.settings.tagLabelPrefix}${tag}`
                                    ));
                                }
                                if (frontMatter.series) {
                                    labels.push(`${this.settings.seriesLabelPrefix}${frontMatter.series}`);
                                }

                                // Create or update labels
								//@ts-ignore
                                const labelIds = await createOrUpdateLabels(repoId, existingLabels, labels, GITHUB_TOKEN!);

                                // First, remove all existing labels that start with our prefixes
                                const existingDiscussion = await executeGitHubGraphQL(
                                    `query getDiscussionLabels($id: ID!) {
                                        node(id: $id) {
                                            ... on Discussion {
                                                labels(first: 100) {
                                                    nodes {
                                                        id
                                                        name
                                                    }
                                                }
                                            }
                                        }
                                    }`,
                                    { id: existingPost.id },
                                    GITHUB_TOKEN!
                                );

                                const existingLabelsToRemove = existingDiscussion.node.labels.nodes
                                    .filter((label: any) =>
                                        label.name.startsWith(this.settings.tagLabelPrefix) ||
                                        label.name.startsWith(this.settings.seriesLabelPrefix)
                                    )
                                    .map((label: any) => label.id);

                                if (existingLabelsToRemove.length > 0) {
                                    await executeGitHubGraphQL(
                                        `mutation removeLabels($labelableId: ID!, $labelIds: [ID!]!) {
                                            removeLabelsFromLabelable(input: {
                                                labelableId: $labelableId,
                                                labelIds: $labelIds
                                            }) {
                                                clientMutationId
                                            }
                                        }`,
                                        {
                                            labelableId: existingPost.id,
                                            labelIds: existingLabelsToRemove
                                        },
                                        GITHUB_TOKEN!
                                    );
                                }

                                // Then add the new labels
                                if (labelIds.size > 0) {
                                    await executeGitHubGraphQL(
                                        ADD_LABELS_TO_DISCUSSION,
                                        {
                                            labelableId: existingPost.id,
                                            labelIds: Array.from(labelIds.values())
                                        },
                                        GITHUB_TOKEN!
                                    );
                                }
                            }
                        }
                        new Notice('Updated frontmatter and labels in GitHub Discussions');
                    }
                }).open();

                // Prompt for content updates
                new OGDModal(this.app, "Would you like to update discussion content in GitHub?", async (result) => {
                    if (result) {
                        for (const { file, frontMatter, sections } of existingFiles) {
                            const existingPost = ghArticles.find(post => {
                                const postFrontMatter = parseYaml(post.body.split("---")[1]);
                                return postFrontMatter.slug === frontMatter.slug;
                            });

                            if (existingPost) {
                                const body = sections[2].trim();

                                // Prepare frontmatter for GitHub
                                const githubFrontMatter = {
                                    slug: frontMatter.slug,
                                    description: frontMatter.description,
                                    published: convertDateFormatToGH(frontMatter.published)
                                };

                                // Create discussion content
                                const discussionBody = `---\n${stringifyYaml(githubFrontMatter)}---\n${body}`;

                                // Update existing discussion
                                await executeGitHubGraphQL(
                                    UPDATE_DISCUSSION_MUTATION,
                                    {
                                        discussionId: existingPost.id,
                                        title: file.basename,
                                        body: discussionBody
                                    },
                                    GITHUB_TOKEN!
                                );
                            }
                        }
                        new Notice('Updated discussion content in GitHub');
                    }
                }).open();
            }

        } catch (error) {
            console.error('Error uploading to GitHub:', error);
            new Notice(`Error uploading to GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };
}

	private async download() {
		return (evt: MouseEvent) => {
			this.checkSettings().then(async passing => {
				if (passing) {
					// Get existing markdown files
					let markdownFiles = this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(this.settings.articlesDir + "/"));
					if (this.settings.makeMd) {
						let filename = this.settings.articlesDir.split("/").last() + ".md";
						markdownFiles = markdownFiles.filter(file => file.name !== filename);
					}

					// Fetch GitHub discussions
					const ghArticles = await fetchGithubDiscussions(GITHUB_TOKEN!, this.settings.owner, this.settings.repo, {
						blogPostCategory: this.settings.blogPostCategory,
						draftLabel: this.settings.draftLabel,
						tagLabelPrefix: this.settings.tagLabelPrefix,
						seriesLabelPrefix: this.settings.seriesLabelPrefix,
					});

					// Create a map of GitHub articles
					const ghArticleMap = new Map<string, any>();
					ghArticles.forEach(article => {
						const frontMatterString = article.body.split("---")[1];
						const body = article.body.split("---")[2];
						const frontMatter = parseYaml(frontMatterString);
						const tags = article.tags;
						const series = article.series;
						frontMatter['tags'] = tags;
						if (series) {
							frontMatter['series'] = series['id'];
						}
						ghArticleMap.set(frontMatter['slug'], [frontMatter, body, article.title]);
					});

					// Create a map of existing file slugs
					const existingFileSlugs = new Set<string>();
					for (const file of markdownFiles) {
						const content = await this.app.vault.read(file);
						const frontmatter = parseYaml(content.split("---")[1]);
						if (frontmatter.slug) {
							existingFileSlugs.add(frontmatter.slug);
						}
					}

					// Handle new files
					const newArticles = Array.from(ghArticleMap.entries())
						.filter(([slug]) => !existingFileSlugs.has(slug));

					if (newArticles.length > 0) {
						new OGDModal(this.app, `Create ${newArticles.length} new articles from GitHub Discussions?`, async (result) => {
							if (result) {
								for (const [slug, [frontMatter, body, title]] of newArticles) {
									// Create filename from the GitHub discussion title
									const fileName = `${title}.md`;
									const filePath = `${this.settings.articlesDir}/${fileName}`;

									// Format the frontmatter date
									if (frontMatter.published) {
										frontMatter.published = convertDateFormatToObsidian(frontMatter.published);
									}

									// Create the file content
									const newContent = "---\n" + stringifyYaml(frontMatter) + "---\n" + body;

									// Create the new file
									await this.app.vault.create(filePath, newContent);
								}
								new Notice(`Created ${newArticles.length} new articles from GitHub Discussions`);
							}
						}).open();
					}

					// Handle existing files updates
					new OGDModal(this.app, "Would you like to update frontmatter from Github Discussions?", (result) => {
						if (result) {
							markdownFiles.map(file => {
								this.app.fileManager.processFrontMatter(file, (frontmatter) => {
									const ghFrontmatter = ghArticleMap.get(frontmatter['slug'])?.[0];
									if (ghFrontmatter) {
										frontmatter['description'] = ghFrontmatter['description'];
										frontmatter['tags'] = ghFrontmatter['tags'] || [];
										frontmatter['published'] = convertDateFormatToObsidian(ghFrontmatter['published']);
										console.log(ghFrontmatter);
										if (ghFrontmatter['tags']) {
											frontmatter['tags'] = ghFrontmatter['tags'];
										}
										if (ghFrontmatter['series']) {
											frontmatter['series'] = ghFrontmatter['series'];
										}
									}
								});
							});
						}
					}).open();

					new OGDModal(this.app, "Would you like to update article bodies from Github Discussions?", (result) => {
						if (result) {
							markdownFiles.map(async file => {
								const sections = await this.app.vault.read(file);
								const frontmatter = parseYaml(sections.split("---")[1]);
								const slug = frontmatter['slug'];
								if (ghArticleMap.has(slug)) {
									const newContent = "---\n" + stringifyYaml(frontmatter) + "---\n" + ghArticleMap.get(slug)[1];
									await this.app.vault.modify(file, newContent);
								}
							});
						}
					}).open();
				}
			});
		};
	}

	private async checkSettings(): Promise<boolean> {
		const folders = this.app.vault.getAllLoadedFiles()
			.filter(file => file instanceof TFolder);
		folders.filter(folder => folder.name === this.settings.articlesDir);
		let success = true;
		if (folders.length === 0) {
			new Notice('OGD: Does the Blog directory exist? Did you configure it in OGDSettings?');
			success = false;
			return Promise.resolve(success);
		}
		let markdownFiles = this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(this.settings.articlesDir + "/"));
		if (this.settings.makeMd) {
			let filename = this.settings.articlesDir.split("/").last() + ".md";
			markdownFiles = markdownFiles.filter(file => file.name !== filename);
		}
		if (markdownFiles.length === 0) {
			new Notice('OGD: No markdown files found in the specified directory.');
		} else {
			// Do something with the markdown files
			new Notice(`OGD: Found ${markdownFiles.length} markdown files in the directory.`);
		}
		if (!GITHUB_TOKEN) {
			new Notice('OGD: This plugin requires an environment variable to be set with the name OGD_GITHUB_TOKEN');
			success = false;
		}
		if (this.settings.owner === "" || this.settings.repo === "") {
			new Notice("OGD: Please ensure owner and repo are configured correctly. Owner should be a Github username and repo should be the name of the repository where we want to publish md to discussions.");
			success = false;
		}
		return Promise.resolve(success);
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class OGDModal extends Modal {
	constructor(app: App, question: string, onSubmit: (result: boolean) => void) {
		super(app);
		this.setTitle("OGD Confirmation Dialog:");
		let approve = false;
		new Setting(this.contentEl)
			.setName(question)
			.addToggle(toggle => {
				toggle.setValue(approve)
					.onChange(async (value) => {
						approve = value;
					})
			});

		new Setting(this.contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Submit')
					.setCta()
					.onClick(() => {
						this.close();
						onSubmit(approve);
					}));
	}
}

class OGDSettingsTab extends PluginSettingTab {
	plugin: ObsidianGithubDiscussions;

	constructor(app: App, plugin: ObsidianGithubDiscussions) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Blog Articles Directory')
			.setDesc('Github Discussion Blog Articles Directory')
			.addDropdown(dropdown => {
				// Get all folders in the vault
				const folders = this.plugin.app.vault.getAllLoadedFiles()
					.filter(file => file instanceof TFolder);

				// Populate the dropdown with folder paths
				folders.forEach(folder => {
					dropdown.addOption(folder.path, folder.path);
				});

				dropdown
					.setValue(this.plugin.settings.articlesDir)
					.onChange(async (value) => {
						this.plugin.settings.articlesDir = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Make MD Plugin Installed?")
			.setDesc("Set to true if using Make MD, else leave false")
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.makeMd)
					.onChange(async (value) => {
						this.plugin.settings.makeMd = value;
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName("Repo Owner")
			.setDesc("Github User who owns the repo")
			.addText(tc => {
				tc.setValue(this.plugin.settings.owner)
					.onChange(async (value) => {
						this.plugin.settings.owner = value;
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName("Repo Name")
			.setDesc("Github Repo Name")
			.addText(tc => {
				tc.setValue(this.plugin.settings.repo)
					.onChange(async (value) => {
						this.plugin.settings.repo = value;
						await this.plugin.saveSettings();
					})
			})

		new Setting(containerEl)
			.setName("Blog Post Category")
			.setDesc("Optional")
			.addText(tc => {
				tc.setValue(this.plugin.settings.blogPostCategory)
					.onChange(async (value) => {
						this.plugin.settings.blogPostCategory = value;
						await this.plugin.saveSettings();
					})
			})

		new Setting(containerEl)
			.setName("Draft Label")
			.setDesc("Optional")
			.addText(tc => {
				tc.setValue(this.plugin.settings.draftLabel)
					.onChange(async (value) => {
						this.plugin.settings.draftLabel = value;
						await this.plugin.saveSettings();
					})
			})

		new Setting(containerEl)
			.setName("Tag Label Prefix")
			.setDesc("Optional")
			.addText(tc => {
				tc.setValue(this.plugin.settings.tagLabelPrefix)
					.onChange(async (value) => {
						this.plugin.settings.tagLabelPrefix = value;
						await this.plugin.saveSettings();
					})
			})

		new Setting(containerEl)
			.setName("Series Label Prefix")
			.setDesc("Optional")
			.addText(tc => {
				tc.setValue(this.plugin.settings.seriesLabelPrefix)
					.onChange(async (value) => {
						this.plugin.settings.seriesLabelPrefix = value;
						await this.plugin.saveSettings();
					})
			})
	}
}
