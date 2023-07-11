import { Peer } from "peerjs";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, remove } from "firebase/database";
//
import "./style.css";
import emojis from "./emojis.json";

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
  const emojiIndex = Math.floor(Math.random() * (emojis.length - 1) + 0);
  const emoji = emojis[emojiIndex];
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
    size: 0,
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
      button.innerText = peer.devicesOnline[peerId].emoji;
      button.classList.add(
        "dark:bg-opacity-20",
        "dark:bg-black",
        "bg-white",
        "w-12",
        "h-12",
        "bg-opacity-20",
        "rounded-full",
        "text-3xl",
        "discovered"
      );
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
  if (!peer.remote?.peerConnection?.connectionState) {
    if (peer.peer.id != connection.peer) {
      helperMessage.innerText = `Connected to: ${
        peer.devicesOnline[connection.peer].emoji
      }`;
      peer.remote = connectToRemote(connection.peer);
      transferProgress.classList.add("hidden");
      await delay(1000);
      startPeerButtonsWrap.remove();
      sendButtonWrap.classList.replace("hidden", "flex");
    }
  }
  connection.on("data", async (incoming) => {
    const { type, data } = incoming;
    if (type == "meta") {
      setProgress(0);
      peer.fileData.size = 0;
      peer.fileData.meta = data;
      peer.fileData.data = [];
      downloadLink.classList.add("hidden");
    } else if (type == "chunk") {
      if (peer.fileData.meta) {
        const totalSize = peer.fileData.meta.size;
        peer.fileData.size += data.byteLength;
        peer.fileData.data.push(data);
        const progress = (100 * peer.fileData.size) / totalSize;
        setProgress(progress);
        peer.remote.send({
          type: "progress",
          data: progress,
        });

        if (progress == 100) {
          triggerFileDownload();
          setProgress(100);
        }
      }
    } else if (type == "progress") {
      setProgress(data);
    }
  });
});

const setProgress = async (value) => {
  const progress = Math.round(value * 100) / 100;
  sendButtonWrap.classList.replace("flex", "hidden");
  transferProgress.classList.remove("hidden");
  transferProgress.innerText = `${progress.toFixed(2).padStart(4, "0")}%`;

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

  const { data, meta } = peer.fileData;

  const blob = new Blob(data, { type: meta.type });
  const objectURL = URL.createObjectURL(blob);

  downloadLink.href = objectURL;
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = meta.name;
  downloadLink.click();

  peer.fileData.meta = null;
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
  let nextStartByteIndex = 0;
  do {
    const chunk = file.slice(
      nextStartByteIndex,
      nextStartByteIndex + chunkSize
    );
    nextStartByteIndex += chunkSize;
    peer.remote.send({
      type: "chunk",
      data: chunk,
    });
    await delay(1);
  } while (nextStartByteIndex < file.size);
  filePickerButton.innerText = "Send another file";
};
