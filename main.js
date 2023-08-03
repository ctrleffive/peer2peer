import { Peer } from "peerjs";
import { initializeApp } from "firebase/app";
import {
  ref,
  set,
  remove,
  getDatabase,
  onChildAdded,
  onChildRemoved,
} from "firebase/database";
//
import "./style.css";
import emojis from "./emojis.json";

const fireApp = initializeApp({
  apiKey: atob("QUl6YVN5RF9GcUJRVko4T0N2aHhibDI1bldRek1TM1d6bzEyemNR"),
  projectId: atob("cGVlci10by1wZWVyLTQyZjE2"),
});
const fireDb = getDatabase(fireApp);

const devicesOnlinePath = "devicesOnline";

/**
 * Body is the file drop area for file upload.
 */
const dropArea = document.body;

const html = document.body.parentElement;
const mediaMode = "(prefers-color-scheme: dark)";
const matchMedia = window.matchMedia;
const themeMeta = document.getElementById("themeMeta");

/**
 * Download file link after data is ready.
 */
const downloadLink = document.getElementById("downloadLink");
/**
 * This is the message that shows right under the app title.
 */
const helperMessage = document.getElementById("helperMessage");
/**
 * "Send file" button wrapper.
 * This contains a label & file input.
 * We need this handler to manage the visibility.
 */
const sendButtonWrap = document.getElementById("sendButtonWrap");
const filePickerButton = document.getElementById("filePickerButton");
// Wrap that holds all post connection functionalities.
const postConnectWrap = document.getElementById("postConnectWrap");
const filePicker = document.getElementById("filePicker");
const textInput = document.getElementById("textInput");
/**
 * Assigned emoji of the active session.
 */
const deviceEmojiWrap = document.getElementById("deviceEmojiWrap");
//
const transferProgress = document.getElementById("transferProgress");
/**
 * This is the wrapper for the emoji buttons of other connections that are discoverd.
 * We will create <button> element & append to this wrap.
 */
const startPeerButtonsWrap = document.getElementById("startPeerButtonsWrap");

/**
 * Get a random emoji from preset emoji list.
 */
const getDeviceEmoji = () => {
  const emojiIndex = Math.floor(Math.random() * (emojis.length - 1) + 0);
  const emoji = emojis[emojiIndex];
  // And show in the UI.
  deviceEmojiWrap.innerHTML = emoji;
  return emoji;
};

const initPeer = async () => {
  state.peer?.destroy();
  state.peer = new Peer();
  state.emoji = getDeviceEmoji();
  state.remote = null;
  return new Promise((resolve) => {
    state.peer.once("open", (peerId) => {
      resolve(peerId);
    });
  });
};

/**
 * State of the app.
 * This is where the shared variables are.
 * We will have to keep the active & remote connections for later use.
 */
const state = {
  /**
   * Id will be created by default from peerjs.
   * We have the id-emoji relation from the firebase database.
   */
  /** @type {import('peerjs').Peer} */
  peer: null,
  emoji: null,
  /** @type {import('peerjs').DataConnection} */
  remote: null,
  focusLostOn: 0,
  devicesOnline: {},
  /**
   * To keep track of the received data.
   * Every time, when we get the meta data for the first time, we will reset this.
   */
  fileData: {
    meta: {},
    data: [],
    size: 0,
  },
};

const destroyRemote = async () => {
  // TODO: Improve this.
  postConnectWrap.classList.replace("flex", "hidden");
  sendButtonWrap.classList.replace("flex", "hidden");
  textInput.classList.add("hidden");

  textInput.value = "";
  state.fileData.size = 0;
  state.fileData.data = [];
  await delay(2000);

  state.remote?.close();
  state.remote = null;
  startPeerButtonsWrap.classList.remove("hidden");
  checkForEmptyConnections();
};

const connectToRemote = (id, isIncoming = false) => {
  if (!isIncoming) {
    helperMessage.innerText = "connecting...";
  }
  // Once a connection is clicked, hide other connections.
  startPeerButtonsWrap.classList.add("hidden");
  const connection = state.peer.connect(id, {
    reliable: true, // For handling large files.
  });

  postConnectWrap.classList.replace("flex", "hidden");
  sendButtonWrap.classList.replace("flex", "hidden");
  textInput.classList.add("hidden");

  delay(4000).then(async () => {
    const connectionState = state.remote?.peerConnection?.connectionState;
    // If remote is not connected even after some time, cancel.
    if (connectionState != "connected") {
      helperMessage.innerText = "Device not reachable!";
      await destroyRemote(id);
      deRegisterDevice(id);
    } else if (connectionState == "connected") {
      postConnectWrap.classList.replace("hidden", "flex");
      sendButtonWrap.classList.replace("hidden", "flex");
      textInput.classList.remove("hidden");
      helperMessage.innerText = `Connected to: ${
        state.devicesOnline[id].emoji
      }`;
    }
  });

  return connection;
};

// Remove all connections that are added 2 hours ago.
setTimeout(() => {
  for (const device of Object.values(state.devicesOnline)) {
    if (Date.now() - device.timeUpdated > 7200000) {
      deRegisterDevice(device.peerId);
    }
  }
}, 3000);

/**
 * Discovery logic.
 * Listening for connections added from firebase database.
 */
onChildAdded(ref(fireDb, devicesOnlinePath), (snapshot) => {
  const device = snapshot.val();
  if (device.peerId != state.peer.id && !state.devicesOnline[device.peerId]) {
    const button = document.createElement("button");
    button.innerText = device.emoji;
    button.setAttribute("data-id", device.peerId);
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
      connectToRemote(device.peerId);
    };
    // Add button to the list.
    startPeerButtonsWrap.append(button);
    // Syncing to the state.
    state.devicesOnline[device.peerId] = device;
  }
  checkForEmptyConnections();
});

/**
 * Discovery logic.
 * Listening for connections removed from firebase database.
 */
onChildRemoved(ref(fireDb, devicesOnlinePath), (snapshot) => {
  const device = snapshot.val();

  // Finding & removing the button which should be removed.
  const buttons = document.getElementsByClassName("discovered");
  for (let index = 0; index < buttons.length; index++) {
    const element = buttons[index];
    if (element.getAttribute("data-id") == device.peerId) {
      element.remove();
    }
  }
  // Syncing to the state.
  delete state.devicesOnline[device.peerId];
  checkForEmptyConnections();
});

/**
 * Checking if there are connections available.
 * If yes, update the helper message accordingly.
 */
const checkForEmptyConnections = () => {
  // We don't want to update the helper text if remote is already connected.
  if (!state.remote) {
    if (Object.keys(state.devicesOnline).length > 0) {
      helperMessage.innerText = "Choose a device to connect.";
    } else {
      helperMessage.innerText = "waiting for connections...";
    }
  }
};

/**
 * Async method for setTimeout.
 */
const delay = (timeout) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
};

/**
 * Add active connection id to online devices db.
 * Also make a new peer connection if peer is not initiated.
 */
const registerDevice = async (peerId = null) => {
  let id = peerId;

  if (state.peer == null || state.peer?.destroyed) {
    // If no peer on state, initiate new peer.
    id = await initPeer();
  }

  if (state.peer?.disconnected) {
    // If existing peer is not open, try reopen in.
    state.peer?.reconnect();
  }

  // Get local peer id as failsafe.
  id = id || state.peer?.id;

  // If still nothing, just stop.
  if (!id) return;

  set(ref(fireDb, devicesOnlinePath + "/" + id), {
    peerId: id,
    emoji: state.emoji,
    timeUpdated: Date.now(),
  });
};

/**
 * Remove a peer id from the online devices db.
 */
const deRegisterDevice = (peerId) => {
  remove(ref(fireDb, devicesOnlinePath + "/" + peerId));
};

registerDevice();

// Set yourself as active once peerjs is connected.
state.peer.on("open", (peerId) => {
  // And listener for window focus change.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      deRegisterDevice(peerId);
    } else {
      registerDevice(peerId);
    }
  });
});

// Try reconnecting when disconnected.
state.peer.on("disconnected", registerDevice);
state.peer.on("error", () => registerDevice());

// Post connection jobs.
state.peer.on("connection", async (connection) => {
  // Respond only if remote connection state is not available.
  if (!state.remote?.peerConnection?.connectionState) {
    // Respond only if remote id is not matching with incoming id.
    if (state.peer.id != connection.peer) {
      helperMessage.innerText = `Connected to: ${
        state.devicesOnline[connection.peer].emoji
      }`;
      // Respond back & try remote connection.
      state.remote = connectToRemote(connection.peer, true);
      transferProgress.classList.add("hidden");
      // Show the file transfer button after a while.
      await delay(1000);
      postConnectWrap.classList.replace("hidden", "flex");
      startPeerButtonsWrap.classList.add("hidden");
      textInput.classList.remove("hidden");
      sendButtonWrap.classList.replace("hidden", "flex");

      // Once connected to a device, make this device unavailable for others.
      deRegisterDevice(state.peer.id);
    }
  }

  connection.on("close", () => {
    if (state.remote?.peer) {
      helperMessage.innerText = "reconnecting...";
      state.remote = connectToRemote(state.remote?.peer, true);
    }
    registerDevice();
  });
  connection.on("error", async () => {
    helperMessage.innerText = "Disconnected!";
    destroyRemote();
    registerDevice();
  });

  connection.on("data", async (incomingData) => {
    const { type, data } = incomingData;

    switch (type) {
      case "meta":
        // First step of the file transfer.
        setProgress(0);
        /**
         * Resetting everything but the meta data.
         * We need this to check the file download progress.
         */
        state.fileData.meta = data;
        //
        state.fileData.size = 0;
        state.fileData.data = [];
        downloadLink.classList.add("hidden");
        break;

      case "chunk":
        // Only accept data chunks if meta data is present.
        if (state.fileData.meta) {
          const totalSize = state.fileData.meta.size;

          // Add size of incoming data to total received size counter.
          state.fileData.size += data.data.byteLength;

          /**
           * Add data to state array.
           * We will make the file later once the whole transfer is complete.
           */
          state.fileData.data.push(data);

          const progress = (100 * state.fileData.size) / totalSize;
          setProgress(progress);

          /**
           * Reporting the progress to the sender.
           * Instead of the sender guessing the progress,
           * this is the best way to show the progress on both ends.
           */
          state.remote.send({ type: "progress", data: progress });

          // Once the transfer is complete, trigger the file download.
          if (progress == 100) {
            triggerFileDownload();
          }
        }
        break;

      case "text":
        textInput.value = data;
        break;

      case "progress":
        // Just update the progress UI.
        setProgress(data);
        break;
    }
  });
});

const setProgress = async (value) => {
  const progress = Math.round(value * 100) / 100;
  textInput.classList.add("hidden");
  sendButtonWrap.classList.replace("flex", "hidden");
  transferProgress.classList.remove("hidden");
  // Rounding to 00
  transferProgress.innerText = `${progress.toFixed(0)}%`;

  // If done, show 100% for a while and hide the progress.
  if (progress == 100) {
    transferProgress.innerText = "Done!";
    await delay(2000);
    textInput.classList.remove("hidden");
    sendButtonWrap.classList.replace("hidden", "flex");
    transferProgress.classList.add("hidden");
  }

  // If it the start of a new transfer, hide the download link.
  if (progress == 0) {
    downloadLink.classList.add("hidden");
  }
};

/**
 * Make the file from data array and trigger download.
 */
const triggerFileDownload = () => {
  const { data, meta } = state.fileData;

  // Make a blob with available data.
  const blob = new Blob(
    /**
     * Make sure to sort it based on the chunk index.
     * This is to ensure the order of chunks of the file sent is correct.
     */
    data.sort((a, b) => a.index - b.index).map((item) => item.data),
    { type: meta.type }
  );
  const objectURL = URL.createObjectURL(blob);

  // Show the download button & trigger it.
  downloadLink.classList.remove("hidden");
  downloadLink.href = objectURL;
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = meta.name;
  downloadLink.click();

  // Reset the meta data for another file transfer.
  state.fileData.meta = null;
};

/**
 * Return the chunk size in mb.
 */
const calculateChunkSize = (sizeBytes) => {
  const maxChunkSize = 1048576 * 10; // 10mb
  const minChunkSize = 1048576 * 0.1; // 100kb

  // Calculate the chunk size based on the file size
  const chunkSize = Math.ceil(sizeBytes / 25);

  // Ensure the chunk size is within the desired range
  return Math.max(minChunkSize, Math.min(maxChunkSize, chunkSize));
};

const sendFile = async (file) => {
  // First step. Send the meta data.
  setProgress(0);
  state.remote.send({
    type: "meta",
    data: {
      name: file.name,
      size: file.size,
      type: file.type,
    },
  });

  /**
   * Index is there to ensure the file received is in correct order.
   * There could be a scenario where because of a network delay,
   * the first packet could come after the previous packet.
   * In that case, having an index helps to later sort it before making the file for download.
   */
  let index = 0;
  const chunkSize = calculateChunkSize(file.size);
  let nextStartByteIndex = 0;
  do {
    const data = file.slice(nextStartByteIndex, nextStartByteIndex + chunkSize);
    nextStartByteIndex += chunkSize;
    // Send each packet.
    state.remote.send({
      type: "chunk",
      data: {
        index,
        data,
      },
    });
    index += 1;
    // Delay is good for a nice progress animation.
    await delay(1);
  } while (nextStartByteIndex < file.size);
  //
  filePickerButton.innerText = "Send another file";
};

// Listen for file picker events.
filePicker.onchange = async (event) => {
  event.preventDefault();
  const file = event.target.files[0];
  if (!file) return;

  await sendFile(file);
};

// Listen for input change events.
textInput.addEventListener("input", async (event) => {
  event.preventDefault();
  const data = event.target.value?.trim();

  state.remote.send({
    type: "text",
    data,
  });
});

/**
 * Only allow drag nd drop if remote connection is available.
 * and send button is visible (not in the middle of a transfer).
 */
const checkIfDroppable = () => {
  return (
    state.remote?.peerConnection?.connectionState == "connected" &&
    !sendButtonWrap.classList.contains("hidden")
  );
};

const handleDragOver = (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (checkIfDroppable()) {
    dropArea.setAttribute("data-dragEnabled", "");
  }
};

const handleDragOut = (event) => {
  event.preventDefault();
  event.stopPropagation();
  dropArea.removeAttribute("data-dragEnabled");
};

const handleDrop = (event) => {
  handleDragOut(event);

  if (checkIfDroppable()) {
    dropArea.removeAttribute("data-dragEnabled");

    const file = event.dataTransfer.files[0];

    // Only one file allowed for now.
    if (file) {
      sendFile(file);
    }
  }
};

dropArea.addEventListener("drop", handleDrop);
dropArea.addEventListener("dragend", handleDragOut);
dropArea.addEventListener("dragover", handleDragOver);
dropArea.addEventListener("dragenter", handleDragOver);
dropArea.addEventListener("dragleave", handleDragOut);

const setAppearance = (isDarkMode = false) => {
  if (isDarkMode) {
    themeMeta.content = "#1e1b4b";
    html.classList.add("dark");
  } else {
    themeMeta.content = "#dcfce7";
    html.classList.remove("dark");
  }
};

if (matchMedia && matchMedia(mediaMode).matches) {
  setAppearance(true);
}

window.matchMedia(mediaMode).addEventListener("change", (event) => {
  setAppearance(event.matches);
});
