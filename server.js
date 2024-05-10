const { 
    CreateAccount, 
    CheckBalance, 
    ExportsPrivatekey, 
    getNFT,
    getState, 
    addBlunt, 
    mintBlunt,
    getNFTBlunt, 
    mintNFT,
    transferNFT,
    uploadIPFS,
    relay,
    createSocial,
    postSocial,
    storageDepositSocial,
    syncProfile,
    getVibe,
    transferToken
} = require("./src");
const express = require('express');
const app = express();
var cors = require('cors');


app.use(cors())
app.use(express.json());

app.post('/account/create', async (req, res) => {
    const body = req.body;
    const result = await CreateAccount(body.accountId);
    res.json(result);
});

app.post('/account/balance', async (req, res) => {
    const body = req.body;
    const result = await CheckBalance(body.accountId);
    res.json(result);
});

app.post('/account/export', async (req, res) => {
    const body = req.body;
    const result = await ExportsPrivatekey(body.accountId,body.privateKey);
    res.json(result);
});

app.post('/account/nft', async (req, res) => {
    const body = req.body;
    const result = await getNFT(body.accountId);
    res.json(result);
});

app.post('/account/state', async (req, res) => {
    const body = req.body;
    const result = await getState(body.accountId);
    res.json(result);
});

app.post('/blunt/add', async (req, res) => {
    const body = req.body;
    const {accountId, seriesId, privateKey, nonce} = body;
    const result = await addBlunt(accountId,seriesId,privateKey,nonce);
    res.json(result);
});

app.post('/blunt/follow', async (req, res) => {
    const body = req.body;
    const result = await addBlunt(body.accountId,body.seriesId,body.privateKey,body.nonce);
    res.json(result);
});

app.post('/blunt/mint', async (req, res) => {
    const body = req.body;
    const result = await mintBlunt(body.accountId,body.seriesId);
    res.json(result);
});

app.post('/blunt/nft', async (req, res) => {
    const body = req.body;
    const result = await getNFTBlunt(body.accountId);
    res.json(result);
});

app.post('/nft/mint', async (req, res) => {
    const body = req.body;
    const {accountId,  title, description ,cid,privateKey,receiverNFT , tokenId} = body;
    const result = await mintNFT(accountId,title,description,cid,privateKey,receiverNFT,tokenId);
    res.json(result);
});

app.post('/nft/transfer', async (req, res) => {
    const body = req.body;
    const {privateKey, accountId, receiverId, tokenId, nftContractId} = body;
    const result = await transferNFT(privateKey,accountId,receiverId,tokenId,nftContractId);
    res.json(result);
});

app.post('/nft/upload-ipfs', async (req, res) => {
    const body = req.body;
    const result = await uploadIPFS(body);
    res.json(result);
});

app.post('/relay', async (req, res) => {
    const body = req.body;
    const result = await relay(body);
    res.json(result);
});

app.post('/social/create', async (req, res) => {
    const body = req.body;
    const result = await createSocial(body.accountId,body.privateKey);
    res.json(result);
});

app.post('/social/post', async (req, res) => {
    const body = req.body;
    const {accountId,cid,privateKey,content} = body;
    const result = await postSocial(accountId,cid,privateKey,content);
    res.json(result);
});

app.post('/social/storage-deposit', async (req, res) => {
    const body = req.body;
    const {accountId,privateKey} = body;
    const result = await storageDepositSocial(accountId,privateKey);
    res.json(result);
});

app.post('/social/sync', async (req, res) => {
    const body = req.body;
    const {accountId,privateKey , tgUserName , tgName , tgUserBio , tgPicprofile , tgBackground} = body;
    const result = await syncProfile(accountId,privateKey , tgUserName , tgName , tgUserBio , tgPicprofile , tgBackground);
    res.json(result);
});

app.post('/social/vibes', async (req, res) => {
    const body = req.body;
    const {accountId,cid,privateKey,friendliness,energy,density,diversity,content} = body;
    const result = await getVibe(accountId,cid,privateKey,friendliness,energy,density,diversity,content);
    res.json(result);
});

app.post('/token/transfer', async (req, res) => {
    const body = req.body;
    const {privateKey, accountId ,receiverId , amount , tokenContract} = body;
    const result = await transferToken(privateKey, accountId ,receiverId , amount , tokenContract);
    res.json(result);
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});