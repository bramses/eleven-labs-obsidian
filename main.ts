import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	requestUrl,
} from "obsidian";

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	elevenLabsAPIKey: string;
	openaiAPIKey: string;
	naturalSounding: boolean;
	prompt: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	elevenLabsAPIKey: "default",
	openaiAPIKey: "default",
	naturalSounding: false,
	prompt: "Convert the following text to natural sounding spoken text, similar to a human voice."
};

const DEFAULT_URL = `https://api.openai.com/v1/chat/completions`;

/*
curl -X 'POST' \
  'https://api.elevenlabs.io/v1/text-to-speech/voice_setting' \
  -H 'accept: audio/mpeg' \
  -H 'xi-api-key: api_key' \
  -H 'Content-Type: application/json' \
  -d '{
  "text": "highlighted_text",
  "voice_settings": {
    "stability": 0,
    "similarity_boost": 0
  }
}'
*/
async function callElevenLabs(text: string, api_key: string, voice_id: string) {
	console.log(text, voice_id);

	const audio = await requestUrl({
		url: "https://api.elevenlabs.io/v1/text-to-speech/" + voice_id,
		method: "POST",
		headers: {
			"xi-api-key": `${api_key}`,
			"Content-Type": "application/json",
		},
		contentType: "application/json",
		body: JSON.stringify({
			text: text,
			voice_settings: {
				stability: 0,
				similarity_boost: 0,
			},
		}),
		throw: false,
	});

	/*
	 access-control-allow-headers: * 
 access-control-allow-methods: POST,OPTIONS,DELETE,GET 
 access-control-allow-origin: * 
 access-control-expose-headers: request_id 
 alt-svc: h3=":443"; ma=2592000,h3-29=":443"; ma=2592000 
 content-length: 256000 
 content-type: audio/mpeg 
 date: Fri,14 Apr 2023 21:46:38 GMT 
 request_id: 7fcf2f9da0524339877b827eb0ec002c 
 server: uvicorn 
 via: 1.1 google
	*/

	// convert audio.text to blob
	const blob = new Blob([audio.arrayBuffer], { type: "audio/mpeg" });
	const url = URL.createObjectURL(blob);
	const audioEl = document.createElement("audio");
	audioEl.src = url;
	audioEl.controls = true;
	audioEl.autoplay = true;

	// save audio to file in folder: eleven-labs-audio
	const folder = await this.app.vault.getAbstractFileByPath(
		"eleven-labs-audio"
	);
	if (!folder) {
		await this.app.vault.createFolder("eleven-labs-audio");
	}

	const fileName = "eleven-labs-audio/" + Date.now() + ".mp3";
	await this.app.vault.create(fileName, blob.arrayBuffer);

	return audioEl;
}

async function naturalSoundingText(text: string, openai_api_key: string, system_prompt: string = "Convert the following text to natural sounding spoken text, similar to a human voice.") {
	const res = await callOpenAIAPI(openai_api_key, [
		{
			role: "system",
			content: system_prompt,
		},
		{ role: "user", content: text },
	]);

	console.log(res);

	return res;
}

async function callOpenAIAPI(
	api_key: string,
	messages: { role: string; content: string }[],
	model = "gpt-3.5-turbo",
	max_tokens = 250,
	temperature = 0.3,
	top_p = 1,
	presence_penalty = 0.5,
	frequency_penalty = 0.5,
	stream = false,
	stop: string[] | null = null,
	n = 1,
	logit_bias: any | null = null,
	user: string | null = null,
	url = DEFAULT_URL
) {
	try {
		console.log("calling openai api");
		const responseUrl = await requestUrl({
			url: url,
			method: "POST",
			headers: {
				Authorization: `Bearer ${api_key}`,
				"Content-Type": "application/json",
			},
			contentType: "application/json",
			body: JSON.stringify({
				model: model,
				messages: messages,
				max_tokens: max_tokens,
				temperature: temperature,
				top_p: top_p,
				presence_penalty: presence_penalty,
				frequency_penalty: frequency_penalty,
				stream: stream,
				stop: stop,
				n: n,
				// logit_bias: logit_bias, // not yet supported
				// user: user, // not yet supported
			}),
			throw: false,
		});

		try {
			const json = responseUrl.json;

			if (json && json.error) {
				new Notice(
					`[Eleven Labs Obsidian] Stream = False Error :: ${json.error.message}`
				);
				throw new Error(JSON.stringify(json.error));
			}
		} catch (err) {
			// continue we got a valid str back
			if (err instanceof SyntaxError) {
				// continue
			} else {
				throw new Error(err);
			}
		}

		const response = responseUrl.text;
		const responseJSON = JSON.parse(response);
		return responseJSON.choices[0].message.content;
	} catch (err) {
		if (err instanceof Object) {
			if (err.error) {
				new Notice(`[Eleven Labs MD] Error :: ${err.error.message}`);
				throw new Error(JSON.stringify(err.error));
			} else {
				if (url !== DEFAULT_URL) {
					new Notice(
						"[Eleven Labs MD] Issue calling specified url: " + url
					);
					throw new Error(
						"[Eleven Labs MD] Issue calling specified url: " + url
					);
				} else {
					console.log(err);
					new Notice(
						`[Eleven Labs MD] Error :: ${JSON.stringify(err)}`
					);
					throw new Error(JSON.stringify(err));
				}
			}
		}

		new Notice("issue calling OpenAI API, see console for more details");
		throw new Error(
			"issue calling OpenAI API, see error for more details: " + err
		);
	}
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status Bar Text");

		// This adds a simple command that can be triggered anywhere
		// this.addCommand({
		// 	id: 'open-sample-modal-simple',
		// 	name: 'Open sample modal (simple)',
		// 	callback: () => {
		// 		new SampleModal(this.app).open();
		// 		const highlighted_text = this.app.workspace.getActiveViewOfType(MarkdownView).editor.getSelection();
		// 	}
		// });

		this.addCommand({
			id: "sample-editor-command",
			name: "Sample editor command",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();

				let text = selection

				if (this.settings.naturalSounding) {
					text = await naturalSoundingText(selection, this.settings.openaiAPIKey);
				}

				const audioEl = await callElevenLabs(
					text,
					this.settings.elevenLabsAPIKey,
					"TxGEqnHWrfWFTfGW9XjX"
				);
				document.body.appendChild(audioEl);
			},
		});

		// This adds a complex command that can check whether the current state of the app allows execution of the command
		// this.addCommand({
		// 	id: 'open-sample-modal-complex',
		// 	name: 'Open sample modal (complex)',
		// 	checkCallback: (checking: boolean) => {
		// 		// Conditions to check
		// 		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// If checking is true, we're simply "checking" if the command can be run.
		// 			// If checking is false, then we want to actually perform the operation.
		// 			if (!checking) {
		// 				new SampleModal(this.app).open();
		// 			}

		// 			// This command will only show up in Command Palette when the check function returns true
		// 			return true;
		// 		}
		// 	}
		// });

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Settings for my awesome plugin." });

		new Setting(containerEl)
			.setName("elevenLabsAPIKey")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.elevenLabsAPIKey)
					.onChange(async (value) => {
						console.log("Secret: " + value);
						this.plugin.settings.elevenLabsAPIKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("openaiAPIKey")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.openaiAPIKey)
					.onChange(async (value) => {
						console.log("Secret: " + value);
						this.plugin.settings.openaiAPIKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("prompt")
			.setDesc("Prompt")
			.addText((text) =>
				text
					.setPlaceholder("Enter your prompt")
					.setValue(this.plugin.settings.prompt)
					.onChange(async (value) => {
						console.log("Prompt: " + value);
						this.plugin.settings.prompt = value;
						await this.plugin.saveSettings();
					})
			);


		new Setting(containerEl)
			.setName("naturalSounding")
			.setDesc("Natural sounding")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.naturalSounding)
					.onChange(async (value) => {
						console.log("Natural sounding: " + value);
						this.plugin.settings.naturalSounding = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
