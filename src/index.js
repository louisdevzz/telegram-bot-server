const { KeyPair,PublicKey } = require('@near-js/crypto');
const { connects,submitTransaction,fundAccount} = require('../helper/utils/meta-transactions');
const { InMemoryKeyStore } = require('@near-js/keystores');
const { actionCreators,FunctionCallPermission,SignedDelegate } = require("@near-js/transactions");
const {SCHEMA} = require('../helper/utils/types/index');
const { deserialize } = require('borsh');
const { generateSeedPhrase } = require('near-seed-phrase');
const axios = require("axios");
const Redis = require('ioredis');
const BN = require("bn.js");
const FormData = require("form-data");
const { Readable } = require("stream");
const {Big} = require('big.js');
const dotenv = require("dotenv");
dotenv.config();
// near call mainnet create_account '{"new_account_id": "kurodenjiro699.near", "new_public_key": "ed25519:"}' --deposit 0.00182 --accountId kurodenjiro.near
async function CreateAccount(accountId) {
  const keyStore = new InMemoryKeyStore();
  const {seedPhrase, publicKey, secretKey} = generateSeedPhrase()
  
  await keyStore.setKey(process.env.NEXT_PUBLIC_NETWORK_ID , process.env.NEXT_PUBLIC_NETWORK_ID  == "mainnet" ? process.env.NEXT_PUBLIC_RELAYER_ACCOUNT_ID_NEAR_MAINNET : process.env.NEXT_PUBLIC_RELAYER_ACCOUNT_ID_NEAR_TESTNET , KeyPair.fromString( process.env.NEXT_PUBLIC_NETWORK_ID  == "mainnet" ? process.env.RELAYER_PRIVATE_KEY_NEAR_MAINNET : process.env.RELAYER_PRIVATE_KEY_NEAR_TESTNET ));
  const signerAccount = await connects(process.env.NEXT_PUBLIC_NETWORK_ID  == "mainnet" ? process.env.NEXT_PUBLIC_RELAYER_ACCOUNT_ID_NEAR_MAINNET : process.env.NEXT_PUBLIC_RELAYER_ACCOUNT_ID_NEAR_TESTNET , keyStore, process.env.NEXT_PUBLIC_NETWORK_ID );
  const gas = "200000000000000";
  const deposit = "0";

  const argsWithSocial  = {
    new_account_id: accountId,
    options: {
      contract_bytes: null,
      full_access_keys: [
        publicKey
      ],
      limited_access_keys: [
        {
          allowance: "250000000000000",
          method_names: "",
          public_key: "ed25519:FQzxfWrjAy1C62hL4cc47cRpUdnrLinajj69yLjwB2DG",
          receiver_id: "social.near"
        }
      ]
    }
  }
  const action = actionCreators.functionCall(
    "create_account_advanced",
    argsWithSocial,
    new BN(gas),
    new BN(deposit)
  );


  try {
    const result = await signerAccount.signAndSendTransaction({
      actions: [action],
      receiverId: "near",
    });
    
    return { privateKey: secretKey,seed:seedPhrase , result};
    
  } catch (error) {
    return error;
  }

}
const viewMethod = async(data) => {
  try {
    const provider = new nearAPI.providers.JsonRpcProvider({ url: process.env.NEXT_PUBLIC_NETWORK_ID =="mainnet" ? process.env.RPC_MAINNET : process.env.RPC_TESTNET });
    let res  = await provider.query({
      request_type: 'call_function',
      account_id: data.contractId,
      method_name: data.method,
      args_base64: Buffer.from(JSON.stringify(data.args)).toString('base64'),
      finality: 'final',
    });
    return JSON.parse(Buffer.from(res.result).toString())
  } catch (error) {
    return 0
  } 
  }
const stateAccount = async(accountId) => {
  try {
    const provider = new nearAPI.providers.JsonRpcProvider({ url: process.env.NEXT_PUBLIC_NETWORK_ID =="mainnet" ? process.env.RPC_MAINNET : process.env.RPC_TESTNET });
    let res = await provider.query({
        request_type: "view_account",
        finality: "final",
        account_id: accountId,
    });
    return res.amount
  } catch (error) {
    return 0
  } 
  }
  
  const getToken = async(accountId ) => {
    const { data } = await axios.get(`${process.env.NEXT_PUBLIC_NETWORK_ID =="mainnet" ? process.env.KITWALLET_MAINNET  : process.env.KITWALLET_TESTNET }/account/${accountId}/likelyTokensFromBlock?fromBlockTimestamp=0`); 
    const tokenPrice  = (await axios.get(`${process.env.NEXT_PUBLIC_NETWORK_ID =="mainnet"  ? process.env.REFFINANCE_MAINNET  : process.env.REFFINANCE_TESTNET}`)).data;
    const contractData = data.list;
    const nearBalance =  await stateAccount(accountId)
    let token  =[];
    const nearMetadata = {
      spec: 'ft-1.0.0',
      name: 'NEAR',
      symbol: 'NEAR',
      icon: null,
      reference: null,
      reference_hash: null,
      decimals: 24
    }
    const parsedNearBalance = Big(nearBalance)
        .div(Big(10).pow(nearMetadata.decimals))
        .toFixed(5);
        
    const nearUsdPrice = parseFloat(tokenPrice['wrap.near'].price);
    
    const nearBalanceInUsd = parseFloat(parsedNearBalance) * nearUsdPrice ;
    
    const contract = 'NEAR'
    if(nearBalanceInUsd){
      token.push({
        ...nearMetadata,
        balance: parsedNearBalance,
        nearUsdPrice,
        contract,
        balanceInUsd: nearBalanceInUsd ? nearBalanceInUsd.toFixed(2) : null,
      })  ;
    }
    
      for (let contract of contractData) {
      const ftMetadata = await viewMethod({contractId:contract,method:"ft_metadata" ,args:{}});
      
      const ftBalance = await viewMethod({contractId:contract,method:"ft_balance_of" ,args:{
          account_id: accountId,
        }});
      
      
      const parsedBalance  = null
      if (ftBalance && ftMetadata) {
        Big(ftBalance)
        .div(Big(10).pow(ftMetadata.decimals))
        .toFixed(5);
      }
      
      let usdPrice = 0;
      let balanceInUsd = null;
      if( tokenPrice[contract]){
        usdPrice = parseFloat(tokenPrice[contract].price);
        balanceInUsd = parseFloat(parsedBalance) * usdPrice;
      }
  
    if( balanceInUsd){
      token.push({
        ...ftMetadata,
        balance: parsedBalance,
        usdPrice,
        contract,
        balanceInUsd: balanceInUsd ? balanceInUsd.toFixed(2) : null,
      })  ;
    }
  
    }
    
    return token
}
async function CheckBalance(accountId) {
  try {
    const token = await getToken(accountId);
    return token;
  } catch (error) {
    return error;
  }
}
async function ExportsPrivatekey(accountId,privateKey) {
  const redis = new Redis();

  const keyStore = new InMemoryKeyStore();

  await keyStore.setKey(process.env.NEXT_PUBLIC_NETWORK_ID, accountId, KeyPair.fromString(privateKey));

  const signerAccount = await connects(accountId, keyStore, process.env.NEXT_PUBLIC_NETWORK_ID);

  const { seedPhrase, publicKey, secretKey } = generateSeedPhrase()
  const state = await signerAccount.getAccessKeys();
  console.log("aa",KeyPair.fromString(privateKey).getPublicKey().toString()) 
  console.log("accesskeyList", state)

  try {
    fundAccount(accountId,process.env.NEXT_PUBLIC_NETWORK_ID)
    
    const deserializeDelegate = await signerAccount.signedDelegate({
      receiverId: accountId,
      blockHeightTtl: 600,
      actions: [actionCreators.addKey(PublicKey.fromString(publicKey), actionCreators.fullAccessKey())],
    });
    const data = await submitTransaction({
      delegate: deserializeDelegate,
      network: process.env.NEXT_PUBLIC_NETWORK_ID,
    });

    
    if (data) {
      const keys = await redis.keys('*')
      for (const key of keys) {
        const keyData = await redis.get(key)
        const value = JSON.parse(keyData);
        if (value.accountId == accountId) {
          value.privateKey = secretKey;
          redis.set(key, JSON.stringify(value));
        }
      }

      await keyStore.setKey(process.env.NEXT_PUBLIC_NETWORK_ID, accountId, KeyPair.fromString(secretKey));

      const signerAccount = await connects(accountId, keyStore, process.env.NEXT_PUBLIC_NETWORK_ID);
    
      const deserializeDelegateDeleteKey = await signerAccount.signedDelegate({
        receiverId: accountId,
        blockHeightTtl: 600,
        actions: [actionCreators.deleteKey(KeyPair.fromString(privateKey).getPublicKey())],
      });

      await submitTransaction({
        delegate: deserializeDelegateDeleteKey,
        network: process.env.NEXT_PUBLIC_NETWORK_ID,
      });

      return { seed: seedPhrase };
    }


  } catch (error) {
    return {error};
  }
}

async function getNFT(accountId) {

  const operationsDoc = `
  query MyQuery {
    mb_views_nft_tokens(
      where: {owner: {_eq: "${accountId}"}}
      limit: 30
      order_by: {last_transfer_timestamp: desc}
    ) {
      token_id
      nft_contract_id
      nft_contract_name
      title
      description
      media
      last_transfer_receipt_id
    }
  }
`;
  const result = await fetch(
    process.env.NEXT_PUBLIC_NETWORK_ID  == "mainnet" ? process.env.MINTBASE_GRAP_MAINNET : process.env.MINTBASE_GRAP_TESTNET,
      {
          headers: {
              "mb-api-key": "omni-site",
              "Content-Type": "application/json"
          },
        method: "POST",
        body: JSON.stringify({
          query: operationsDoc,
          variables: {},
          operationName: "MyQuery"
        })
      }
    );



const nftOwnedList = await result.json();

let nft  = {};
nftOwnedList.data.mb_views_nft_tokens.forEach((item)=> {
  
  if(nft[item.nft_contract_id]){
      nft[item.nft_contract_id].push(item);
  }else{
      nft[item.nft_contract_id]=[];
      nft[item.nft_contract_id].push(item);
  }
  
});
  

  return {nft};
}

const stateAccounts = async(accountId) => {
  try {
    const provider = new nearAPI.providers.JsonRpcProvider({ url: process.env.NEXT_PUBLIC_NETWORK_ID =="mainnet" ? process.env.RPC_MAINNET : process.env.RPC_TESTNET });
    let res = await provider.query({
        request_type: "view_account",
        finality: "final",
        account_id: accountId,
    });
    return res;
  } catch (error) {
    return error
  } 
  }

async function getState(accountId) {
  const response = await stateAccounts(accountId);
  return {response};
}

async function addBlunt(accountId, seriesId ,privateKey , nonce) {
  const keyStore = new InMemoryKeyStore();

  await keyStore.setKey( process.env.NEXT_PUBLIC_NETWORK_ID , accountId, KeyPair.fromString(privateKey));
  const signerAccount = await connects(accountId, keyStore,  process.env.NEXT_PUBLIC_NETWORK_ID );

  const gas = "300000000000000";
  const deposit = "10000000000000000000000";

   const args = {
    proposal: {
      description: `https://near.social/mob.near/widget/MainPage.N.Post.Page?accountId=${accountId}&blockHeight=${nonce}`,
      kind: {
        AddMemberToRole: {
        member_id: accountId,
          role: seriesId
        }
      }
    }
  }
      
  const action = actionCreators.functionCall(
      "add_proposal",
      args,
      new BN(gas),
      new BN(deposit)
    );

    const delegate = await signerAccount.signedDelegate({
      actions: [action],
      blockHeightTtl: 600,
      receiverId: process.env.NEXT_PUBLIC_NETWORK_ID == "mainnet" ? process.env.BLUNT_SPUTNIK_DAO_MAINNET : process.env.BLUNT_SPUTNIK_DAO_TESTNET ,
    });

try {
  const result = await submitTransaction({
    delegate: delegate,
    network:  process.env.NEXT_PUBLIC_NETWORK_ID,
  });
  return {result};
} catch (error) {
  return {error};
}
}

async function followBlunt(accountId,privateKey) {
  const keyStore = new InMemoryKeyStore();

  await keyStore.setKey( process.env.NEXT_PUBLIC_NETWORK_ID, accountId, KeyPair.fromString(privateKey));
  const signerAccount = await connects(accountId, keyStore,  process.env.NEXT_PUBLIC_NETWORK_ID);

  const gas = "300000000000000";
  const deposit = "20000000000000000000000";

  const args ={
    data:{
        [accountId]: {
            graph: {
              follow: {
                "bluntdao.near": ""
              }
            },
            index: {
              graph: {key:"follow",value:{type:"follow",accountId:"bluntdao.near"}},
              notify: {key:"bluntdao.near",value:{type:"follow"}}
            }
          }
    } 
  }

  const action = actionCreators.functionCall(
      "set",
      args,
      new BN(gas),
      new BN(deposit)
    );

    const delegate = await signerAccount.signedDelegate({
      actions: [action],
      blockHeightTtl: 600,
      receiverId:  process.env.NEXT_PUBLIC_NETWORK_ID  =="mainnet" ? process.env.SOCIAL_NEAR_MAINNET : process.env.SOCIAL_NEAR_TESTNET,
    });
    try {
      const result = await submitTransaction({
        delegate: delegate,
        network:  process.env.NEXT_PUBLIC_NETWORK_ID,
      });
      return {result};
    } catch (error) {
      return {error};
    }
}

async function mintBlunt(accountId, seriesId) {
  const keyStore = new InMemoryKeyStore();

  await keyStore.setKey(process.env.NEXT_PUBLIC_NETWORK_ID , process.env.BLUNT_MAINNET, KeyPair.fromString(process.env.BLUNT_PRIVATE_KEY_MAINNET ));

  const signerAccount = await connects(process.env.BLUNT_MAINNET, keyStore, process.env.NEXT_PUBLIC_NETWORK_ID );
 

  const gas = "300000000000000";
  const deposit = "10000000000000000000000";
  
   const args  = {
    receiver_id: accountId,
            id: seriesId +"",
      }
      

try {
  const action = actionCreators.functionCall(
    "nft_mint",
    args,
    new BN(gas),
    new BN(deposit)
  );

  const delegate = await signerAccount.signedDelegate({
    actions: [action],
    blockHeightTtl: 600,
    receiverId: process.env.NEXT_PUBLIC_NETWORK_ID == "mainnet" ? process.env.BLUNT_MAINNET: process.env.BLUNT_TESTNET,
  });

  const result = await submitTransaction({
    delegate: delegate,
    network:  process.env.NEXT_PUBLIC_NETWORK_ID ,
  });
  return {result};
} catch (error) {
  console.log(error)
  return {error}
}
}

async function getNFTBlunt(accountId) {
  const redis = new Redis();
  let account_reviecer= ""
  if(accountId.includes(".near")){
    account_reviecer = accountId
  }
  else{
    const keys = await redis.keys('*')
    for (const key of keys) {
      const keyData  =await redis.get(key)
      const value = JSON.parse(keyData);
      if(value.user_telegram?.toLowerCase() == accountId){
        account_reviecer="mrpsycox.near"
      }
    }
  }
  const operationsDoc = `
  query MyQuery {
      mb_views_nft_tokens(
        where: {_and: {nft_contract_id: {_eq: "nft.bluntdao.near"}}, owner: {_eq: "${account_reviecer}"}}
        limit: 30
        order_by: {last_transfer_timestamp: desc}
      ) {
        token_id
        nft_contract_id
        title
        description
        media
        last_transfer_receipt_id
      }
    }
    
`;
  const result = await fetch(
    process.env.NEXT_PUBLIC_NETWORK_ID == "mainnet" ? process.env.MINTBASE_GRAP_MAINNET : process.env.MINTBASE_GRAP_TESTNET ,
      {
          headers: {
              "mb-api-key": "omni-site",
              "Content-Type": "application/json"
          },
        method: "POST",
        body: JSON.stringify({
          query: operationsDoc,
          variables: {},
          operationName: "MyQuery"
        })
      }
    );



const nftOwnedList = await result.json();

let nft = {};
nftOwnedList.data.mb_views_nft_tokens.forEach((item)=> {
  
  if(nft[item.nft_contract_id]){
      nft[item.nft_contract_id].push(item);
  }else{
      nft[item.nft_contract_id]=[];
      nft[item.nft_contract_id].push(item);
  }
  
});
  

  return {nft};
}

async function mintNFT(accountId,  title, description ,cid,privateKey,receiverNFT , tokenId) {

  const keyStore = new InMemoryKeyStore();

  await keyStore.setKey(process.env.NEXT_PUBLIC_NETWORK_ID , accountId, KeyPair.fromString(privateKey));

  const signerAccount = await connects(accountId, keyStore, process.env.NEXT_PUBLIC_NETWORK_ID);
 

  const gas = "300000000000000";
  const deposit = "10000000000000000000000";
  const data = JSON.stringify({
    "name": title,
    "description": description,
    "image": `ipfs://${cid}`,
    "image_integrity": "r+xt9t8/MXEvI5fg4JIcb4+iskjgljeb2KWafdaRHoU=",
    "image_mimetype": "image/png",
    "animation_url": "",
    "animation_url_integrity": "sha256-",
    "animation_url_mimetype": "",
    "properties": [
        {
            "trait_type": "File Type",
            "value": "image/png"
        }
    ]
});
const config = {
  method: 'post',
  url: 'https://api.pinata.cloud/pinning/pinJSONToIPFS',
  headers: { 
    "Content-Type": "application/json",
    Authorization: process.env.JWT_PINATA_CLOUD
  },
  data: data
};
  const ipfsJson = await axios(config);
   const args = {
        token_id: tokenId,
        metadata: {
          title: title,
          description: description,
          media: `https://gateway.pinata.cloud/ipfs/${cid}`,
          reference: `ipfs/${ipfsJson.data.IpfsHash}`,
        },
        receiver_id: receiverNFT
      }
      
  const action = actionCreators.functionCall(
      "nft_mint",
      args,
      new BN(gas),
      new BN(deposit)
    );

    const delegate = await signerAccount.signedDelegate({
      actions: [action],
      blockHeightTtl: 600,
      receiverId: process.env.NEXT_PUBLIC_NETWORK_ID == "mainnet" ? process.env.GENADROP_MAINNET: process.env.GENADROP_TESTNET ,
    });

try {
  const result = await submitTransaction({
    delegate: delegate,
    network:  process.env.NEXT_PUBLIC_NETWORK_ID,
  });
  return {result};
} catch (error) {
  return {error};
}
}

async function transferNFT(privateKey, accountId ,receiverId , tokenId ,nftContractId) {
  const keyStore = new InMemoryKeyStore();

  await keyStore.setKey(process.env.NEXT_PUBLIC_NETWORK_ID, accountId, KeyPair.fromString(privateKey));
  const signerAccount = await connects(accountId, keyStore, process.env.NEXT_PUBLIC_NETWORK_ID );
  

  const gas = "200000000000000";
  const deposit = "1";

   const args = {
        token_id: tokenId,
        receiver_id: receiverId,
      }
  const action = actionCreators.functionCall(
      "nft_transfer",
      args,
      new BN(gas),
      new BN(deposit)
    );

    const delegate = await signerAccount.signedDelegate({
      actions: [action],
      blockHeightTtl: 600,
      receiverId: nftContractId,
    });

    try {
      const result = await submitTransaction({
        delegate: delegate,
        network: process.env.NEXT_PUBLIC_NETWORK_ID,
      });
      return {result};
    } catch (error) {
      return {error};
    }
}

async function uploadIPFS(body) {
  const JWT = process.env.JWT_PINATA_CLOUD
  try {
      const response = await axios(JSON.parse(body.data).url, { responseType: 'arraybuffer' })
      const buffer64 = Buffer.from(response.data, 'binary');
      const stream = Readable.from(buffer64);
      const data = new FormData();
  data.append('file', stream, {
    filepath: 'nft.jpg'
  })

  const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", data, {
    maxBodyLength: Infinity,
    headers: {
        'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
        Authorization: JWT
    }
  });
  
  return { cid:res.data.IpfsHash };
} catch (error) {
  return {error};
}
}
async function relay(body) {
  const deserializeDelegate = deserialize(SCHEMA, SignedDelegate, Buffer.from(new Uint8Array(body)));

  const result = await submitTransaction({
    delegate: deserializeDelegate,
    network: process.env.NEXT_PUBLIC_NETWORK_ID,
  });

  return {result};
}

async function createSocial(accountId,privateKey) {
  const keyStore = new InMemoryKeyStore();

  await keyStore.setKey( process.env.NEXT_PUBLIC_NETWORK_ID, accountId, KeyPair.fromString(privateKey));
  const signerAccount = await connects(accountId, keyStore,  process.env.NEXT_PUBLIC_NETWORK_ID);

  const gas = "300000000000000";
  const deposit = "20000000000000000000000";

    const args  = {
    data: {
      [accountId]: {}
    }

  }

  const action = actionCreators.functionCall(
      "set",
      args,
      new BN(gas),
      new BN(deposit)
    );

    const delegate = await signerAccount.signedDelegate({
      actions: [action],
      blockHeightTtl: 600,
      receiverId:  process.env.NEXT_PUBLIC_NETWORK_ID =="mainnet" ? process.env.SOCIAL_NEAR_MAINNET : process.env.SOCIAL_NEAR_TESTNET,
    });
    try {
      const result = await submitTransaction({
        delegate: delegate,
        network:  process.env.NEXT_PUBLIC_NETWORK_ID ,
      });
      return {result};
    } catch (error) {
      return {error};
    }
      
}

const findHashtags = (searchText) =>{
  const regexp = /\B\#\w\w+\b/g
  const result = searchText.match(regexp) || [];
      return result;
}

async function postSocial(accountId,cid,privateKey,content) {
  const tags  = findHashtags(content);
  const tagsArg = [];
  tags.forEach(element => {
    tagsArg.push({
        key: element,
        value: {
            type: "social",
            path: `${accountId}/post/main`
        }
    })
  });

  const keyStore = new InMemoryKeyStore();

  await keyStore.setKey( process.env.NEXT_PUBLIC_NETWORK_ID , accountId, KeyPair.fromString(privateKey));
  const signerAccount = await connects(accountId, keyStore,  process.env.NEXT_PUBLIC_NETWORK_ID );

  const gas = "300000000000000";
  const deposit = "30000000000000000000000";
  let args  = null
  if(cid){
    args  = {
      data:{
        [accountId]: {
          post: {
              main:JSON.stringify({
                  type: "md",
                  text: `${content} ![](https://ipfs.near.socail/ipfs/${cid})`,
                  image: {
                      ipfs_cid: cid
                  }
              })
          },
          index: {
              post: JSON.stringify( {
                  key: "main",
                  value: {
                      type: "md"
                  }
              }),
              hashtag:JSON.stringify(tagsArg)
          }
      }
      }

    }
  }else{
    args  = {
      data:{
        [accountId]: {
          post: {
              main:JSON.stringify({
                  type: "md",
                  text: content,
              })
          },
          index: {
              post: JSON.stringify( {
                  key: "main",
                  value: {
                      type: "md"
                  }
              }),
              hashtag:JSON.stringify(tagsArg)
          }
      }
      }

    }
  }
  

  const action = actionCreators.functionCall(
      "set",
      args,
      new BN(gas),
      new BN(deposit)
    );

    const delegate = await signerAccount.signedDelegate({
      actions: [action],
      blockHeightTtl: 600,
      receiverId:  process.env.NEXT_PUBLIC_NETWORK_ID  =="mainnet" ? process.env.SOCIAL_NEAR_MAINNET  : process.env.SOCIAL_NEAR_TESTNET ,
    });
    try {
      const result = await submitTransaction({
        delegate: delegate,
        network:  process.env.NEXT_PUBLIC_NETWORK_ID ,
      });
      return {result};
    } catch (error) {
      return {error};
    }
}

async function storageDepositSocial(accountId,privateKey) {
  const keyStore = new InMemoryKeyStore();

  await keyStore.setKey( process.env.NEXT_PUBLIC_NETWORK_ID , accountId, KeyPair.fromString(privateKey));
  const signerAccount = await connects(accountId, keyStore,  process.env.NEXT_PUBLIC_NETWORK_ID );

  const gas = "300000000000000";
  const deposit = "30000000000000000000000";

    const args  = {
    account_id :accountId
  }

  const action = actionCreators.functionCall(
      "storage_deposit",
      args,
      new BN(gas),
      new BN(deposit)
    );

    const delegate = await signerAccount.signedDelegate({
      actions: [action],
      blockHeightTtl: 600,
      receiverId:  process.env.NEXT_PUBLIC_NETWORK_ID  =="mainnet" ? process.env.SOCIAL_NEAR_MAINNET  : process.env.SOCIAL_NEAR_TESTNET,
    });
    try {
      const result = await submitTransaction({
        delegate: delegate,
        network:  process.env.NEXT_PUBLIC_NETWORK_ID,
      });
      return {result};
    } catch (error) {
      return {error};
    }
}

async function syncProfile(accountId,privateKey , tgUserName , tgName , tgUserBio , tgPicprofile , tgBackground) {
  const keyStore = new InMemoryKeyStore();

  await keyStore.setKey( process.env.NEXT_PUBLIC_NETWORK_ID, accountId, KeyPair.fromString(privateKey));
  const signerAccount = await connects(accountId, keyStore,  process.env.NEXT_PUBLIC_NETWORK_ID );

  const gas = "300000000000000";
  const deposit = "50000000000000000000000";

    const args = {
    data: {
      [accountId]: {
          profile: {
              name:  tgName,
              description: tgUserBio,
              linktree: {
                  telegram: tgUserName,
              },
              image: {
                ipfs_cid: tgPicprofile
              },
              tags: {
                dropwallet: "",
                near: "",
                genadrop: ""
              }
            }
        }
    }

  }

  const action = actionCreators.functionCall(
      "set",
      args,
      new BN(gas),
      new BN(deposit)
    );

    const delegate = await signerAccount.signedDelegate({
      actions: [action],
      blockHeightTtl: 600,
      receiverId:  process.env.NEXT_PUBLIC_NETWORK_ID =="mainnet" ? process.env.SOCIAL_NEAR_MAINNET  : process.env.SOCIAL_NEAR_TESTNET,
    });
    try {
      const result = await submitTransaction({
        delegate: delegate,
        network:  process.env.NEXT_PUBLIC_NETWORK_ID,
      });
      return {result};
    } catch (error) {
      return {error};
    }
}

async function getVibe(accountId,cid,privateKey,friendliness,energy,density,diversity,content) {
  const keyStore = new InMemoryKeyStore();
  const findHashtags = (searchText) =>{
    const regexp = /\B\#\w\w+\b/g
    const result = searchText.match(regexp) || [];
        return result;
    }
  await keyStore.setKey( process.env.NEXT_PUBLIC_NETWORK_ID, accountId, KeyPair.fromString(privateKey));
  const signerAccount = await connects(accountId, keyStore,  process.env.NEXT_PUBLIC_NETWORK_ID );

  const tags = findHashtags(content);
  const tagsArg = [];
  tagsArg.push( {
    key:"proofofvibes",
    value:{
        type:"social",
        path:`${accountId}/post/main`
    }
})
tagsArg.push( {
  key:"ProofOfVibes",
  value:{
  type:"social",
  path:`${accountId}/post/main`}
})
tagsArg.push(  {
  key:"Drop Wallet",
  value:{
      type:"social",
      path:`${accountId}/post/main`
  }
})
  tags.forEach(element => {
    tagsArg.push({
        key: element,
        value: {
            type: "social",
            path: `${accountId}/post/main`
        }
    })
  });
  const gas = "300000000000000";
  const deposit = "50000000000000000000000";
  let args  = {
      data: {
        [accountId]: {
          post: {
            main: JSON.stringify({
              type:"md",
              image:{
                  ipfs_cid:cid
              },
              text:`#ProofOfVibes #   @proofofvibes.near ${content} \n ## **Vibe-rating**  ❤️ **Friendliness:** ${friendliness}/10 ⚡️ **Energy:** ${energy}/10 🧊 **Density:** ${density}/10 🌈 **Diversity:** ${diversity}/10`,
              metadata:{
                  tastemaker:[]
              }
          }),
          rating: `${parseInt(friendliness)+parseInt(energy)+parseInt(density)+parseInt(diversity)}`,
          friendliness: `${friendliness}0`,
          energy: `${energy}0`,
          density: `${density}0`,
          diversity: `${diversity}0`
          },
          index: {
            post: JSON.stringify({key:"main",value:{type:"md"}}),
            hashtag: JSON.stringify(tagsArg),
            notify: JSON.stringify({
              key:"proofofvibes.near",
              value:{
                  type:"mention",
                  item:{
                      type:"social",
                      path:`${accountId}/post/main`
                  }
              }
          })
          }
        }
      }
    
  }
  const action = actionCreators.functionCall(
      "set",
      args,
      new BN(gas),
      new BN(deposit)
    );

    const delegate = await signerAccount.signedDelegate({
      actions: [action],
      blockHeightTtl: 600,
      receiverId:  process.env.NEXT_PUBLIC_NETWORK_ID =="mainnet" ? process.env.SOCIAL_NEAR_MAINNET : process.env.SOCIAL_NEAR_TESTNET ,
    });
    try {
      const result = await submitTransaction({
        delegate: delegate,
        network:  process.env.NEXT_PUBLIC_NETWORK_ID ,
      });
      return {result};
    } catch (error) {
      return {error};
    }
}

async function transferToken(privateKey, accountId ,receiverId , amount , tokenContract) {
  const keyStore = new InMemoryKeyStore();
  
  await keyStore.setKey(process.env.NEXT_PUBLIC_NETWORK_ID, accountId, KeyPair.fromString(privateKey));
  const signerAccount = await connect(accountId, keyStore, process.env.NEXT_PUBLIC_NETWORK_ID);


if(tokenContract == 'NEAR'){
  const newAmount = (parseInt(amount)-50000000000000000000).toLocaleString('fullwide', {useGrouping:false}) ;
  try {
    const result = await signerAccount.signAndSendTransaction({
      receiverId: receiverId,
      actions: [actionCreators.transfer(new BN(newAmount))],
    });
    return  { status: "successful",result };
  } catch (error) {
    return {error};
  }
}else{
  const gas = "300000000000000";
  const deposit = "30000000000000000000000";
  const args  = {
    amount: amount,
    receiver_id: receiverId,
  }
const action = actionCreators.functionCall(
  "ft_transfer",
  args,
  new BN(gas),
  new BN(deposit)
);
const deserializeDelegate = await signerAccount.signedDelegate({
    actions: [action],
    blockHeightTtl: 600,
    receiverId: tokenContract,
  });
  try {
    const result = await submitTransaction({
      delegate: deserializeDelegate,
      network:  process.env.NEXT_PUBLIC_NETWORK_ID,
    });
    return { status: "successful" ,result};
  } catch (error) {
    return {error};
  }
}
}

module.exports={
  CreateAccount,
  CheckBalance,
  ExportsPrivatekey,
  getNFT,
  getState,
  addBlunt,
  followBlunt,
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
}