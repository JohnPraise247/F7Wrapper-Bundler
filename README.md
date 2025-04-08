## F7Wrapper-Bundler

**F7Wrapper Bundler** streamlines the bundling process for apps built with the [F7Wrapper plugin](https://ds.justplayer.de/projects/f7wrapper). It packages your app’s HTML, CSS, and JavaScript assets into a single, optimized JavaScript file—perfect for seamless integration with the DroidScript APK Builder, which benefits from simplified obfuscation and packaging.

The bundler uses a dedicated DroidScript service alongside Node.js to handle intensive bundling and optimization tasks efficiently.


## Features

- **Node.js & DroidScript Service**: Leverages both for fast and efficient bundling.
- **All-in-One Bundling**: Combines HTML, CSS, and JavaScript into a single JavaScript output file.
- **Minification**: Reduces file size by minifying JavaScript, CSS, and HTML.
- **Framework7 Ready**: Ensures `Dom7` is initialized before executing scripts.
- **Ignore Rules**: Supports `.bundleignore` to exclude files and directories from the bundle.
<!-- - **Custom Options**: Configure minification and comment-stripping preferences. -->


## Using `.bundleignore`

### What It Does

The `.bundleignore` file functions similarly to `.gitignore`, allowing you to exclude specific files or folders from being bundled. Excluded items are still copied to the output directory untouched.

### How to Use

1. Create a `.bundleignore` file in your app’s root directory.
2. Add file or folder patterns you wish to exclude:
   ```bash
   # Example .bundleignore
   secret.js
   assets/*
   ```
3. Run the bundler—excluded items will be skipped during the process.


## Important Notes

- **Premium Access**: A premium DroidScript subscription is required to use this tool.
- **Node Initialization Errors**: Restart DroidScript or update to the latest version if you encounter issues initializing Node.js.
- **Crash on Start**: If you get the message *"Unfortunately, DroidScript has stopped"*, update Droidscript and ensure your device has enough memory.
- **Commented Code**: Bundler does **not** ignore commented-out lines like `f7.style`, `f7.script`, `f7.addPage`, or `f7.addPanel`. Remove unused code manually to avoid issues.
- **Debugging Tips**: If the bundler fails, check your console logs for detailed error messages.


## Contributing

Have a fix or suggestion? Submit a pull request or report issues on [Github](https://github.com/JohnPraise247/F7Wrapper-Bundler).


## License

This project is released under the MIT License.


## Acknowledgments

- Built for [F7Wrapper plugin](https://ds.justplayer.de/projects/f7wrapper).
- Special thanks to the DroidScript team for their continued development of the platform.
