const f7wb = {
    serviceStarted:false,
    nodeReady:false,
    domAppList: "",
    appNum: 0,
    exportPath: app.LoadText("exportPath", "/sdcard/Droidscript/F7WB_Export", "f7WBundler"),
    isBundling: false
}

const ScanFolders = (path) => {
    const folders = app.ListFolder(path, null, null, "Alphasort,Folders"); // Get all folders
    const matchingFolders = [];
    folders.forEach(folder => {
        const folderPath = `${path}/${folder}`;
        const files = app.ListFolder(folderPath, null, 0); // Get files in folder
        let found = false;
        let imgPath = ""; // Store image path if found
        let projectType = ""; // Store image path if found
        
        // Check for matching HTML or JS file containing the plugin
        files.forEach(file => {
            const filePath = `${folderPath}/${file}`;
            if(file === `${folder}.js`) {
                const content = app.ReadFile(filePath);
                if(content.includes("app.LoadPlugin('F7Wrapper')") || content.includes('app.LoadPlugin("F7Wrapper")')) {
                    found = true;
                    projectType = "f7"
                }
            }
        });
        
        // Check for an image in the Img/ subfolder
        const imgFolderPath = `${folderPath}/Img`;
        if(app.FolderExists(imgFolderPath)) {
            const imgFiles = app.ListFolder(imgFolderPath, null, 0);
            imgPath = imgFiles.includes("app-icon.png") ? `${imgFolderPath}/app-icon.png` : imgFiles.includes(`${folder}.png`) ? `${imgFolderPath}/${folder}.png` : "";
        }
        // Add to results if conditions are met
        if(found && folder !== "F7Wrapper Bundler") {
            matchingFolders.push({
                name: folder,
                icon: imgPath,
                type: projectType
            });
        }
    });
    return matchingFolders;
}

function formatSize(bytes, decimals = 2) {
    if(bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
    return `${size} ${sizes[i]}`;
}
window.f7wb = f7wb;
window.ScanFolders = ScanFolders;
window.formatSize = formatSize