const fs = require('fs').promises;
const path = require('path');
const Terser = require('terser');
const htmlMinifier = require('html-minifier').minify;
const CleanCSS = require('clean-css');

const basePath = __dirname.slice(0, __dirname.lastIndexOf("/") + 1);

// Helper to calculate directory size
async function getDirectorySize(dirPath) {
  let totalSize = 0;

  async function calculateSize(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await calculateSize(fullPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
      }
    }
  }

  await calculateSize(dirPath);
  return totalSize;
}

// Helper to delete a directory and its contents
async function deleteDirectory(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.error(`Failed to delete directory ${dirPath}: ${err.message}`);
    throw err;
  }
}

// Escape for use in backtick template literal
function escapeForTemplateLiteral(code) {
  return code
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\r?\n/g, '\\n');
}

// Replace $$ with Dom7 in JavaScript code
function replaceDollarSignsWithDom7(code) {
  return code.replace(/(?<![\w\$])\$\$(?![\w\$])/g, 'Dom7');
}

// Use Terser to minify JavaScript (with configurable options)
async function minifyJS(code, options = {}) {
  const { enableMangle = true, removeComments = true, minify = true } = options;

  if (!minify) {
    return code;
  }

  try {
    const result = await Terser.minify(code, {
      compress: true,
      mangle: enableMangle ? {
        reserved: ['Dom7', 'Framework7', 'f7App', 'f7View', 'f7IsReady', 'f7Func', 'f7ToggleBackColor']
      } : false,
      output: {
        comments: !removeComments
      }
    });
    if (result.error) {
      console.error('Terser error:', result.error);
      return code;
    }
    return result.code;
  } catch (err) {
    console.error('Terser error:', err);
    return code;
  }
}

// Minify CSS content using CleanCSS
function minifyCSS(cssContent) {
  const minifier = new CleanCSS({ level: 2, specialComments: 0 });
  const result = minifier.minify(cssContent);
  if (result.errors.length > 0) {
    console.error('CleanCSS errors:', result.errors);
    return cssContent;
  }
  return result.styles;
}

// Minify HTML content and re-inject script tags
async function processHTML(htmlContent, options = {}) {
  const { removeComments = true, minify = true } = options;
  const scriptRegex = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;
  let scriptTags = [];

  const htmlWithScriptPlaceholders = await Promise.all(
    Array.from(htmlContent.matchAll(scriptRegex)).map(async ([match, openTag, scriptContent, closeTag], index) => {
      const updatedScriptContent = replaceDollarSignsWithDom7(scriptContent);
      const minifiedScript = await minifyJS(updatedScriptContent, { enableMangle: false, removeComments, minify });
      const escapedScript = escapeForTemplateLiteral(minifiedScript);
      const placeholder = `__SCRIPT_${index}__`;
      scriptTags.push(`${openTag}${escapedScript}${closeTag}`);
      return { match, placeholder };
    })
  ).then(replacements => {
    let result = htmlContent;
    replacements.forEach(({ match, placeholder }) => {
      result = result.replace(match, placeholder);
    });
    return result;
  });

  const minifiedHTML = htmlMinifier(htmlWithScriptPlaceholders, {
    removeComments: true,
    collapseWhitespace: true,
    removeAttributeQuotes: true,
    minifyJS: false,
    minifyCSS: true,
  });

  let finalHTML = minifiedHTML;
  scriptTags.forEach((scriptTag, index) => {
    finalHTML = finalHTML.replace(`__SCRIPT_${index}__`, scriptTag);
  });

  return { html: finalHTML };
}

// Minify HTML content (for panels, no script extraction)
function minifyHTML(htmlContent) {
  return htmlMinifier(htmlContent, {
    removeComments: true,
    collapseWhitespace: true,
    removeAttributeQuotes: true,
    minifyJS: true,
    minifyCSS: true,
  });
}

// Load and parse .bundleignore file
async function loadIgnorePatterns(tPath) {
  const ignoreFilePath = path.join(tPath, '.bundleignore');
  try {
    const content = await fs.readFile(ignoreFilePath, 'utf8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(pattern => pattern.replace(/\*/g, '.*').replace(/\?/g, '.')); // Convert wildcards to regex
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error(`Failed to read .bundleignore at ${ignoreFilePath}: ${err.message}`);
    return [];
  }
}

// Check if a file path matches any ignore patterns
function isIgnored(filePath, ignorePatterns) {
  return ignorePatterns.some(pattern => {
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(filePath);
  });
}

// Copy ignored files to export directory
async function copyIgnoredFiles(tPath, exportPath, ignoredFiles) {
  for (const filePath of ignoredFiles) {
    const srcPath = path.resolve(tPath, filePath);
    const destPath = path.join(exportPath, filePath);
    try {
      console.log(`Copying ignored file ${srcPath} to ${destPath}`);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
    } catch (err) {
      console.error(`Failed to copy ignored file ${srcPath} to ${destPath}: ${err.message}`);
    }
  }
}

// Replace all occurrences of f7.addPage with f7.addPageContent and f7.addPanel with f7.addPanelContent
async function processAddPageAndPanel(jsContent, jsFilePath, ignorePatterns, ignoredFiles, inlineScripts, options = {}) {
  const pageRegex = /f7\.addPage\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*(null|\{[^}]*\})?\s*(?:,\s*(\([^)]+\)|true|false))?)?\s*\)/g;
  const panelRegex = /f7\.addPanel\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  let updatedContent = await jsContent.replaceAsync(pageRegex, async (match, pagePath, options, activePage) => {
    if (isIgnored(pagePath, ignorePatterns)) {
      console.log(`Ignoring page file: ${pagePath} (matches .bundleignore)`);
      ignoredFiles.add(pagePath);
      return match;
    }
    const absPagePath = path.resolve(path.dirname(jsFilePath), pagePath);
    try {
      console.log(`Processing page file: ${absPagePath}`);
      let pageContent = await fs.readFile(absPagePath, 'utf8');
      const { html } = await processHTML(pageContent, options);

      const pageName = path.basename(pagePath, path.extname(pagePath));
      const optionsStr = options && options !== 'null' ? options.slice(1, -1) : '';
      const activePageStr = activePage ? `, ${activePage}` : '';
      const comma = optionsStr ? ', ' : '';

      return `f7.addPageContent('${pageName}', {${optionsStr}${comma}content: \`${html}\`}${activePageStr})`;
    } catch (err) {
      console.error(`Failed to read page HTML file at ${absPagePath}: ${err.message}`);
      return match;
    }
  });

  updatedContent = await updatedContent.replaceAsync(panelRegex, async (match, panelPath) => {
    if (isIgnored(panelPath, ignorePatterns)) {
      console.log(`Ignoring panel file: ${panelPath} (matches .bundleignore)`);
      ignoredFiles.add(panelPath);
      return match;
    }
    const absPanelPath = path.resolve(path.dirname(jsFilePath), panelPath);
    try {
      console.log(`Processing panel file: ${absPanelPath}`);
      const panelContent = await fs.readFile(absPanelPath, 'utf8');
      const minifiedPanelContent = minifyHTML(panelContent);
      return `f7.addPanelContent(\`${minifiedPanelContent}\`)`;
    } catch (err) {
      console.error(`Failed to read or process panel HTML file at ${absPanelPath}: ${err.message}`);
      return match;
    }
  });

  return updatedContent;
}

// Add replaceAsync method to String prototype if not already present
if (!String.prototype.replaceAsync) {
  String.prototype.replaceAsync = async function (regex, asyncFn) {
    const matches = [];
    this.replace(regex, (...args) => {
      matches.push(args);
      return '';
    });
    const replacements = await Promise.all(matches.map(async args => await asyncFn(...args)));
    let result = this;
    matches.forEach((matchArgs, i) => {
      result = result.replace(matchArgs[0], () => replacements[i]);
    });
    return result;
  };
}

// Scan for asset folders and copy them to export directory, with special handling for node_modules
async function copyAssetFolders(sourceDir, exportPath) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const folderPath = path.join(sourceDir, entry.name);
      const destPath = path.join(exportPath, entry.name);

      if (entry.name === 'node_modules') {
        try {
          await fs.access(folderPath);
          console.log(`Copying node_modules to ${destPath}`);
          await fs.mkdir(destPath, { recursive: true });
          await copyDirectory(folderPath, destPath);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.error(`Failed to copy node_modules from ${folderPath} to ${destPath}: ${err.message}`);
          }
        }
      } else {
        const files = await fs.readdir(folderPath, { withFileTypes: true });
        const hasCodeFiles = files.some(file => 
          file.isFile() && /\.(html|css|js)$/i.test(file.name)
        );

        if (!hasCodeFiles) {
          console.log(`Copying asset folder ${folderPath} to ${destPath}`);
          await fs.mkdir(destPath, { recursive: true });
          for (const file of files) {
            if (file.isFile()) {
              const srcFile = path.join(folderPath, file.name);
              const destFile = path.join(destPath, file.name);
              console.log(`Copying asset file ${srcFile} to ${destFile}`);
              await fs.copyFile(srcFile, destFile);
            }
          }
        } else {
          console.log(`Skipping folder ${folderPath} (contains code files)`);
        }
      }
    }
  }
}

// Helper function to recursively copy a directory
async function copyDirectory(srcDir, destDir) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function bundleCSSAndJS(jsFilePath, exportPath, options = {}) {
  const { removeComments = true, minify = true } = options;

  console.log(`Starting bundling process for ${jsFilePath}...`);

  // Check if exportPath exists, and delete it if it does
  try {
    await fs.access(exportPath);
    await deleteDirectory(exportPath);
    console.log(`Deleted existing directory at ${exportPath}`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error checking or deleting export directory ${exportPath}: ${err.message}`);
      throw err;
    }
  }

  console.log(`Reading main JavaScript file: ${jsFilePath}`);
  let jsContent = await fs.readFile(jsFilePath, 'utf8');
  const tPath = path.dirname(jsFilePath);

  console.log(`Loading ignore patterns from .bundleignore in ${tPath}`);
  const ignorePatterns = await loadIgnorePatterns(tPath);
  const ignoredFiles = new Set();

  console.log(`Processing f7.addPage and f7.addPanel calls...`);
  jsContent = await processAddPageAndPanel(jsContent, jsFilePath, ignorePatterns, ignoredFiles, [], options);

  const styleRegex = /f7\.style\(['"]([^'"]+)['"]\)/g;
  const scriptRegex = /f7\.script\(['"]([^'"]+)['"]\)/g;

  let allMatches = [];
  let innerExecuteCode = [];

  console.log(`Processing f7.style calls (CSS files)...`);
  for (const match of jsContent.matchAll(styleRegex)) {
    const fullMatch = match[0];
    const cssRelativePath = match[1];
    if (isIgnored(cssRelativePath, ignorePatterns)) {
      console.log(`Ignoring CSS file: ${cssRelativePath} (matches .bundleignore)`);
      ignoredFiles.add(cssRelativePath);
      continue;
    }
    const absCssPath = path.resolve(path.dirname(jsFilePath), cssRelativePath);

    try {
      console.log(`Reading and minifying CSS file: ${absCssPath}`);
      let cssContent = await fs.readFile(absCssPath, 'utf8');
      cssContent = minifyCSS(cssContent);
      cssContent = cssContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

      const code = `
        const style = document.createElement("style");
        style.textContent = \`${cssContent}\`;
        document.head.appendChild(style);`;
      
      innerExecuteCode.push(code);
      allMatches.push({ index: match.index, length: fullMatch.length });
    } catch (err) {
      console.error(`Failed to read CSS file at ${absCssPath}: ${err.message}`);
    }
  }

  console.log(`Processing f7.script calls (JS files)...`);
  for (const match of jsContent.matchAll(scriptRegex)) {
    const fullMatch = match[0];
    const jsRelativePath = match[1];
    if (isIgnored(jsRelativePath, ignorePatterns)) {
      console.log(`Ignoring JS file: ${jsRelativePath} (matches .bundleignore)`);
      ignoredFiles.add(jsRelativePath);
      continue;
    }
    const absScriptPath = path.resolve(path.dirname(jsFilePath), jsRelativePath);

    try {
      console.log(`Reading and minifying JS file: ${absScriptPath}`);
      let jsInline = await fs.readFile(absScriptPath, 'utf8');
      jsInline = replaceDollarSignsWithDom7(jsInline);
      jsInline = await minifyJS(jsInline, { removeComments, minify });
      innerExecuteCode.push(jsInline);
      allMatches.push({ index: match.index, length: fullMatch.length });
    } catch (err) {
      console.error(`Failed to read JS file at ${absScriptPath}: ${err.message}`);
    }
  }

  const outputFilePath = path.join(exportPath, path.basename(jsFilePath));
  
  if (allMatches.length === 0) {
    console.log(`No f7.style or f7.script calls to bundle. Writing original content to ${outputFilePath}`);
    await fs.mkdir(exportPath, { recursive: true });
    await fs.writeFile(outputFilePath, jsContent);
  } else {
    console.log(`Bundling ${allMatches.length} f7.style/f7.script calls...`);
    allMatches.sort((a, b) => a.index - b.index);
    for (let i = allMatches.length - 1; i >= 0; i--) {
      const { index, length } = allMatches[i];
      jsContent = jsContent.slice(0, index) + jsContent.slice(index + length);
    }

    const combinedCode = `(() => {\n${innerExecuteCode.join('\n')}\n})();`;
    console.log(`Minifying combined code...`);
    const minifiedCode = await minifyJS(combinedCode, { removeComments, minify });
    const escaped = escapeForTemplateLiteral(minifiedCode);

    const injectBlock = `
const waitForDom7 = setInterval(() => {
    if (typeof Dom7 !== 'undefined' && typeof f7 !== 'undefined') {
        clearInterval(waitForDom7);
        f7.execute(\`${escaped}\`);
    }
}, 50);
`;

    const insertIndex = allMatches.length > 0 ? allMatches[0].index : jsContent.length;
    jsContent = jsContent.slice(0, insertIndex) + injectBlock + jsContent.slice(insertIndex);

    console.log(`Writing bundled content to ${outputFilePath}`);
    await fs.mkdir(exportPath, { recursive: true });
    await fs.writeFile(outputFilePath, jsContent);
  }

  console.log(`Copying asset folders from ${tPath} to ${exportPath}...`);
  await copyAssetFolders(tPath, exportPath);

  console.log(`Copying ignored files to ${exportPath}...`);
  await copyIgnoredFiles(tPath, exportPath, ignoredFiles);

  console.log(`Performing final minification of ${outputFilePath}...`);
  let finalContent = await fs.readFile(outputFilePath, 'utf8');
  finalContent = await minifyJS(finalContent, { removeComments, minify });
  await fs.writeFile(outputFilePath, finalContent);

  console.log(`Calculating size of export directory ${exportPath}...`);
  const exportDirSize = await getDirectorySize(exportPath);
  console.log(`Bundling complete! Export directory size: ${exportDirSize} bytes`);
  parent.SendMessage(`bundleDone::${exportDirSize}`);
}

const bundle = async (jsFilePath, exportPath, options = {}) => {
  const { removeComments = true, minify = true } = options;
  await bundleCSSAndJS(jsFilePath, exportPath, { removeComments, minify });
};

// Message handler
parent.SetOnMessage(async function (msg) {
  msg = msg.replace("_DONE_", "");
  const data = msg.split("::");
  const cmd = data[0];
  let res = data[1];

  try {
    switch (cmd) {
      case 'getDirSize':
        const targetPath = path.join(basePath, res);
        const size = await getDirectorySize(targetPath);
        parent.SendMessage(`${cmd}::${size}`);
        break;

      case 'startBundle':
        res = res.split(";;");
        let appDir = res[0];
        let tPath = path.join(basePath, appDir);
        let jsFile = path.join(tPath, `${appDir}.js`);
        jsFile = jsFile.replace("_DONE_", "");

        let exportPath = res[1].replace("/sdcard/Droidscript/", "");
        exportPath = path.join(basePath, exportPath + "/" + appDir);
        exportPath = exportPath.replace("_DONE_", "");

        const removeComments = res[2] === "true";
        const minify = res[3] === "true";

        await bundle(jsFile, exportPath, { removeComments, minify });
        break;

      default:
        // console.warn(`Unknown command: ${cmd}`);
    }
  } catch (err) {
    console.error(`Error handling ${cmd}: ${err.message}`);
    throw err;
  }
});