//Created: 04-04-25

ide.AddModule("terser");
ide.AddModule("html-minifier");
ide.AddModule("clean-css");

app.SetDebugEnabled(false);

//Install plugin from https://ds.justplayer.de/projects/f7wrapper if not done already 
app.LoadPlugin("F7Wrapper");

class App {
    constructor() {
        this.quit = 0;
        this.isDark = app.LoadBoolean("isDark", false, "f7WBundler");
        this.clr = this.isDark ? "#1b1c1e" : "#ffffff";
    }

    onInit() {
        f7.setBackColor(this.clr);
        f7.disableTextSelection();
        f7.disableDrag()
    }

    onStart() {
        f7.enableDarkMode(this.isDark);

        f7.style("css/app.css");
        f7.script("js/app.js");

        //add pages
        f7.addPage("pages/splash.html", null, true);
        f7.addPage("pages/home.html");
        f7.addPage("pages/settings.html");
        f7.addPage("pages/bundle.html");

        this.svc = app.CreateService("this", "this",()=> f7.execute('f7wb.serviceStarted=true'));
        this.svc.SetOnMessage(this.OnServiceMessage);
    }

    OnServiceMessage(msg) {
        let data = msg.split("::");
        let cmd = data[0];
        let res = data[1];

        switch(cmd) {
            case "ctxid: main": 
                f7.toast("Ready", 800)
                break;
            case "nodeReady":
                f7.execute('f7wb.nodeReady = true');
                break;
            case "getDirSize":
                f7.execute('$$("#txtS").text(formatSize( ' + res + ' ))')
                break;
            case "bundleDone":
                f7.execute(' f7App.progressbar.hide();f7wb.isBundling=false; $$("#bundleBtn").toggleClass("disabled");$$("#bBtn").toggleClass("back disabled");$$("#txtEs").text(formatSize( ' + res + ' )).addClass("text-color-green")');
                f7.execute("f7wb.exportPath", (path) => f7.toast(`Exported to '${path}'`))
                break;
            case "error":
                f7.execute(`$$("#log").append("<div class=text-color-red>> ${res}</div>");$$("#log").scrollTop($$("#log")[0].scrollHeight, 500);`);
                break;
            default:
                f7.execute(`$$("#log").append("<div>> ${msg}</div>");$$("#log").scrollTop($$("#log")[0].scrollHeight, 500);`);
            //   alert(msg);
        }
    }

    onFunc(key, value) {
        this.svc.SendMessage(key + "::" + value)
    }

    onPause() {
        if(this.svc) {
            this.svc.Stop();//To prevent service from running in the background when the app isnt active or when app has been closed, we call this.svc.Stop()
            this.svc = null;
            f7.execute("f7wb.isBundling", (isBundling) => {
                if(isBundling) {
                    app.ShowPopup("Bundling failed");
                    f7.execute('f7wb.isBundling=false; $$("#bundleBtn").toggleClass("disabled");$$("#bBtn").toggleClass("back disabled")')
                }
            })

            //   app.ShowPopup( "Service stopped" )
        }
    }

    onResume() {
        if(!this.svc) {//Restart service, on app resume
            this.svc = app.CreateService("this", "this");
            this.svc.SetOnMessage(this.OnServiceMessage);
            //   app.ShowPopup( "Service started" )
        }
    }

    onBack(path) {
        if(path !== "/splash") {
            if(path === "/home") {
                if(this.quit === 0) {
                    f7.toast("Press again to exit")
                    this.quit++;
                } else {
                    this.svc.Stop()
                    app.Exit();
                }
                setTimeout(() => this.quit = 0, 2000);
            } else if(path.startsWith("/bundle")) {
                f7.execute("f7wb.isBundling", (isBundling) => !isBundling ? f7.back() : f7.toast("Bundling in progress"))
            } else {
                f7.back();
            }
        }
    }
}
