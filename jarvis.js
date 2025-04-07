// #!/usr/bin/env node

"use strict";

// Import necessary libraries
const { program } = require("commander");
const { Porcupine, BuiltinKeyword, getBuiltinKeywordPath } = require("@picovoice/porcupine-node");
const { PvRecorder } = require("@picovoice/pvrecorder-node");
const express = require("express");
const path = require("path");

// Hardcode your access key here
const ACCESS_KEY = 'iqLfvWcfkM9iiqfkskRPR/CF8phpfwu7w9MS6mkhegdSBD83cA/oPQ==';  // Replace with your access key

// Command-line argument setup
program
  .option("-k, --keyword_file_paths <string>", "absolute path(s) to Porcupine keyword files (.ppn)")
  .option("-b, --keywords <string>", `Built-in keyword(s) (${Object.keys(BuiltinKeyword)})`)
  .option("-l, --library_file_path <string>", "absolute path to Porcupine dynamic library")
  .option("-m, --model_file_path <string>", "absolute path to Porcupine model")
  .option("-s, --sensitivity <number>", "sensitivity value between 0 and 1", parseFloat, 0.5)
  .option("-i, --audio_device_index <number>", "index of audio device to use to record audio", Number, -1)
  .option("-d, --show_audio_devices", "show the list of available devices");

// Parse command-line arguments
if (process.argv.length < 3) {
  program.help();
}
program.parse(process.argv);

// Flag for handling interrupts
let isInterrupted = false;

async function micDemo() {
  const accessKey = ACCESS_KEY;  // Use the hardcoded access key
  let keywordPaths = program["keyword_file_paths"];
  let keywords = program["keywords"];
  const libraryFilePath = program["library_file_path"];
  const modelFilePath = program["model_file_path"];
  const sensitivity = program["sensitivity"];
  const audioDeviceIndex = program["audio_device_index"];
  const showAudioDevices = program["show_audio_devices"];

  const keywordPathsDefined = keywordPaths !== undefined;
  const builtinKeywordsDefined = keywords !== undefined;
  const showAudioDevicesDefined = showAudioDevices !== undefined;

  if (showAudioDevicesDefined) {
    const devices = PvRecorder.getAvailableDevices();
    devices.forEach((device, index) => {
      console.log(`index: ${index}, device name: ${device}`);
    });
    process.exit();
  }

  // Handle missing or conflicting keyword options
  if ((keywordPathsDefined && builtinKeywordsDefined) || (!keywordPathsDefined && !builtinKeywordsDefined)) {
    console.error(
      "One of --keyword_file_paths or --keywords is required: Specify a comma-separated list of built-in --keywords (e.g. 'GRASSHOPPER'), or --keyword_file_paths to .ppn files"
    );
    return;
  }

  // Handling built-in keywords
  if (builtinKeywordsDefined) {
    keywordPaths = [];
    for (let builtinKeyword of keywords.split(",")) {
      let keywordString = builtinKeyword.trim().toUpperCase();
      if (keywordString in BuiltinKeyword) {
        keywordPaths.push(getBuiltinKeywordPath(BuiltinKeyword[keywordString]));
      } else {
        console.error(`Keyword argument ${keywords} is not in the list of built-in keywords`);
        return;
      }
    }
  }

  // If path is a single string, split it into an array
  if (!Array.isArray(keywordPaths)) {
    keywordPaths = keywordPaths.split(",");
  }

  let keywordNames = keywordPaths.map((keywordPath) => {
    let keywordName = keywordPath.split(/[\\|\/]/).pop().split("_")[0];
    return keywordName;
  });

  // Validate sensitivity value
  if (isNaN(sensitivity) || sensitivity < 0 || sensitivity > 1) {
    console.error("--sensitivity must be a number in the range [0,1]");
    return;
  }

  // Apply the same sensitivity to all keywords
  let sensitivities = Array(keywordPaths.length).fill(sensitivity);

  // Initialize Porcupine with specified parameters
  const handle = new Porcupine(
    accessKey,  // Using the hardcoded access key
    keywordPaths,
    sensitivities,
    modelFilePath,
    libraryFilePath
  );

  const frameLength = handle.frameLength;
  const recorder = new PvRecorder(frameLength, audioDeviceIndex);
  recorder.start();

  console.log(`Using device: ${recorder.getSelectedDevice()}...`);
  console.log(`Listening for wake word(s): ${keywordNames}`);
  console.log("Press ctrl+c to exit.");

  while (!isInterrupted) {
    try {
      const pcm = await recorder.read();
      let index = handle.process(pcm);
      if (index !== -1) {
        console.log(`Detected '${keywordNames[index]}'`);
      }
    } catch (error) {
      console.error("Error reading audio: ", error);
      break;
    }
  }

  console.log("Stopping...");
  recorder.release();
}

// Setup signal interrupt handling (Ctrl+C)
process.on("SIGINT", function () {
  isInterrupted = true;
});

// Create Express app to serve the index.html
const app = express();
const port = 3000;  // Port to run the server on

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the index.html file at the root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  // Now run the micDemo function
  (async function () {
    try {
      await micDemo();
    } catch (e) {
      console.error(e.toString());
    }
  })();
});
