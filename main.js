import "./style.css";
import { Peer } from "peerjs";

const delay = (timeout) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
};

const peer = {
  /** @type {import('peerjs').Peer} */
  peer: null,
  /** @type {import('peerjs').DataConnection} */
  remote: null,
  fileData: {
    meta: {},
    data: [],
  },
};

const startPeerButtons = document.getElementById("startPeerButtons");
const sendButtonWrap = document.getElementById("sendButtonWrap");
const transferProgress = document.getElementById("transferProgress");
const downloadLink = document.getElementById("downloadLink");
const filePickerButton = document.getElementById("filePickerButton");

const connectToRemote = (id) => {
  return peer.peer.connect(id, {
    reliable: true,
  });
};

const setProgress = async (value) => {
  const progress = Math.round(value);
  sendButtonWrap.classList.replace("flex", "hidden");
  transferProgress.classList.remove("hidden");
  transferProgress.innerText = `${progress}%`;

  if (progress == 100) {
    await delay(1000);
    transferProgress.innerText = "done!";
    await delay(2000);
    sendButtonWrap.classList.replace("hidden", "flex");
    transferProgress.classList.add("hidden");
  }
};

const triggerFileDownload = () => {
  downloadLink.classList.remove("hidden");

  const { meta, data } = peer.fileData;

  const blob = new Blob([data], { type: meta.type });
  const objectURL = URL.createObjectURL(blob);

  downloadLink.href = objectURL;
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = meta.name;
  downloadLink.click();
};

const startPeer = async (variant) => {
  startPeerButtons.innerText = "starting...";

  const appId = "chandu-";
  const otherVariant = variant == "A" ? "B" : "A";

  peer.peer = new Peer(`${appId}${variant}`);

  peer.peer.on("open", () => {
    startPeerButtons.innerText = `Choose ${otherVariant} on the other side!`;
    connectToRemote(`${appId}${otherVariant}`);
  });

  peer.peer.on("connection", async (connection) => {
    if (!peer.remote) {
      if (peer.peer.id != connection.peer) {
        if (connection.peer.includes(appId)) {
          startPeerButtons.innerText = `Connected!`;
          peer.remote = connectToRemote(connection.peer);
          await delay(1000);
          startPeerButtons.remove();
          sendButtonWrap.classList.replace("hidden", "flex");
        }
      }
    }
    connection.on("data", async (incoming) => {
      const { type, data } = incoming;
      if (type == "meta") {
        setProgress(0);
        peer.fileData.meta = data;
        peer.fileData.data = new ArrayBuffer(0);
        downloadLink.classList.add("hidden");
      } else if (type == "chunk") {
        const totalSize = peer.fileData.meta.size;

        const newBuffer = new Uint8Array(
          peer.fileData.data.byteLength + data.byteLength
        );
        newBuffer.set(new Uint8Array(peer.fileData.data), 0);
        newBuffer.set(new Uint8Array(data), peer.fileData.data.byteLength);

        peer.fileData.data = newBuffer.buffer;
        const sizeSoFar = peer.fileData.data.byteLength;
        const progress = (100 * sizeSoFar) / totalSize;

        setProgress(progress);
        peer.remote.send({
          type: "progress",
          data: progress,
        });
      } else if (type == "progress") {
        setProgress(data);
      } else if (type == "completed") {
        triggerFileDownload();
      }
    });
  });
};

const startButtons = document.getElementsByClassName("startPeerButton");
for (let index = 0; index < startButtons.length; index++) {
  const element = startButtons[index];
  element.addEventListener("click", () => {
    const variant = element.getAttribute("data-variant");
    startPeer(variant);
  });
}

document.getElementById("filePicker").onchange = async (event) => {
  event.preventDefault();
  const file = event.target.files[0];
  if (!file) return;

  setProgress(0);
  peer.remote.send({
    type: "meta",
    data: {
      name: file.name,
      size: file.size,
      type: file.type,
    },
  });

  const chunkSize = 40000;
  for (let start = 0; start < file.size; start += chunkSize) {
    const chunk = file.slice(start, start + chunkSize + 1);
    peer.remote.send({
      type: "chunk",
      data: chunk,
    });
    await delay(100);
  }
  peer.remote.send({ type: "completed" });
  filePickerButton.innerText = "Send another file";
};
