import { Peer } from "peerjs";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, remove } from "firebase/database";
//
import "./style.css";

const fireApp = initializeApp({
  apiKey: "AIzaSyD_FqBQVJ8OCvhxbl25nWQzMS3Wzo12zcQ",
  authDomain: "peer-to-peer-42f16.firebaseapp.com",
  projectId: "peer-to-peer-42f16",
  storageBucket: "peer-to-peer-42f16.appspot.com",
  messagingSenderId: "960903239635",
  appId: "1:960903239635:web:560c63910880301841c126",
});
const fireDb = getDatabase(fireApp);

const startPeerButtonsWrap = document.getElementById("startPeerButtonsWrap");
const sendButtonWrap = document.getElementById("sendButtonWrap");
const transferProgress = document.getElementById("transferProgress");
const downloadLink = document.getElementById("downloadLink");
const filePickerButton = document.getElementById("filePickerButton");
const helperMessage = document.getElementById("helperMessage");
const deviceEmojiWrap = document.getElementById("deviceEmojiWrap");

const deviceEmoji = (() => {
  const emojiStart = 0x1f601; // Start of emoji range in ASCII
  const emojiEnd = 0x1f64f; // End of emoji range in ASCII

  const emojiCode =
    Math.floor(Math.random() * (emojiEnd - emojiStart + 1)) + emojiStart;
  const emoji = String.fromCodePoint(emojiCode);
  deviceEmojiWrap.innerHTML = emoji;
  return emoji;
})();

const peer = {
  peer: new Peer(),
  /** @type {import('peerjs').DataConnection} */
  remote: null,
  devicesOnline: {},
  fileData: {
    meta: {},
    data: [],
  },
};

const connectToRemote = (id) => {
  return peer.peer.connect(id, {
    reliable: true,
  });
};

const devicesOnlinePath = "devicesOnline";
onValue(ref(fireDb, devicesOnlinePath), (snapshot) => {
  peer.devicesOnline = snapshot.val() || {};

  if (!peer.remote?.peer) {
    delete peer.devicesOnline[peer.peer.id];

    startPeerButtonsWrap.innerHTML = "";

    if (Object.keys(peer.devicesOnline).length > 0) {
      helperMessage.innerText = "Choose a device to connect.";
    } else {
      helperMessage.innerText = "Waiting for connections...";
    }

    for (const peerId in peer.devicesOnline) {
      if (Date.now() - peer.devicesOnline[peerId].timeAdded > 300000) {
        deRegisterDevice(peerId);
      }

      const button = document.createElement("button");
      button.innerHTML = `
    <button type="button" class="dark:bg-opacity-20 dark:bg-black bg-white w-12 h-12 bg-opacity-20 rounded-full text-3xl discovered">${peer.devicesOnline[peerId].emoji}</button>`;
      button.onclick = (event) => {
        event.preventDefault();
        helperMessage.innerText = "connecting...";
        startPeerButtonsWrap.classList.add("hidden");
        connectToRemote(peerId);
      };
      startPeerButtonsWrap.append(button);
    }
  }
});

const delay = (timeout) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
};

const registerDevice = (peerId) => {
  if (!peer.devicesOnline[peerId]) {
    set(ref(fireDb, devicesOnlinePath + "/" + peerId), {
      peerId,
      emoji: deviceEmoji,
      timeAdded: Date.now(),
    });
  }
};

const deRegisterDevice = (peerId) => {
  remove(ref(fireDb, devicesOnlinePath + "/" + peerId));
};

peer.peer.on("open", (peerId) => {
  registerDevice(peerId);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      deRegisterDevice(peerId);
    } else {
      registerDevice(peerId);
    }
  });
});

peer.peer.on("connection", async (connection) => {
  if (!peer.remote) {
    if (peer.peer.id != connection.peer) {
      helperMessage.innerText = `Connected to: ${
        peer.devicesOnline[connection.peer].emoji
      }`;
      peer.remote = connectToRemote(connection.peer);
      await delay(1000);
      startPeerButtonsWrap.remove();
      sendButtonWrap.classList.replace("hidden", "flex");
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

const setProgress = async (value) => {
  const progress = Math.round(value);
  sendButtonWrap.classList.replace("flex", "hidden");
  transferProgress.classList.remove("hidden");
  transferProgress.innerText = `${progress}%`;

  if (progress == 100) {
    await delay(2000);
    sendButtonWrap.classList.replace("hidden", "flex");
    transferProgress.classList.add("hidden");
  }

  if (progress == 0) {
    downloadLink.classList.add("hidden");
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

  const chunkSize = 3000;
  for (let start = 0; start < file.size; start += chunkSize) {
    const chunk = file.slice(start, start + chunkSize);
    peer.remote.send({
      type: "chunk",
      data: chunk,
    });
  }
  peer.remote.send({ type: "completed" });
  filePickerButton.innerText = "Send another file";
};
