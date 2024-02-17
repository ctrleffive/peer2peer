# Peer 2 Peer Data Transfer
![Code Quality](https://github.com/ctrleffive/peer2peer/actions/workflows/code_quality.yml/badge.svg)

A peer-to-peer data transferring app that transfers data directly between devices regardless of the network, allowing it to work even when the devices are not on the same network.

## 🙋‍♂️ How to use?
1. Open `peer2peer.pages.dev` on both of your devices.
2. Each time you open the app, you will see a big emoji. That's your ID.
3. If you are seeing `waiting for devices...` make sure the other device is online and the app's window is in focus.
4. On any of the devices, click on the device's emoji you want to connect from the list.
5. You can just start typing on the input box if you want. It will appear on the other side in real-time.
6. Choose a file or drag & drop any file to transfer.

## 📝 Checklist
- [x] Large file transfer.
- [x] Dark mode adaptation.
- [x] Drag & drop.
- [ ] Multiple files transfer.

## 🚀 Development
- Clone the repo on your side: `git@github.com:ctrleffive/p2p.git`
- Install dependencies: `bun install`
- Start local server: `bun start`
- Build: `bun run build`
