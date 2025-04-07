var node;
//Called when service is started.
function OnStart() {
    app.Debug("Starting Node service");
    node = app.CreateNode()
    node.SetOnReady(() => node.Run("node_.js"));
    node.SetOnMessage((msg) => app.SendMessage(msg));
    node.SetOnOutput((msg) => app.SendMessage(msg));
    node.SetOnError((msg) => app.SendMessage('error::'+msg));
}
//Called when we get a message from main app.
function OnMessage(msg) {
    let data = msg.split("::");
    let cmd = data[0];
    let res = data[1];
    node.SendMessage(cmd + "::" + res)
}