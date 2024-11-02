import { requestSuiFromFaucetV0, getFaucetHost } from '@mysten/sui.js/faucet';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import {  } from '@mysten/sui.js/utils';
import { Secp256k1Keypair } from '@mysten/sui.js/keypairs/secp256k1';
import { getGame, findAllObjects,
    GameObject, 
     getAdminState, getPlayerStates, getAction, Action, handleAction, ActionType,
     GameState,
     parseGameState,
     BetType,
     zeroEncryptLocal,
     actionsAreSame
     } from './Game';

import { getRandomScalar } from './Crypto';
import { PACKAGE_ADDRESS } from './constants';

var fs = require('fs');

const js_crypto_1 = require("@iden3/js-crypto");

const ADMIN_ADDRESS = '0x70cba2254a6c73a68e2ad3f079e7f14c4233d5dfb4dc0f3c519321c843903cab';

const url =  'https://fullnode.devnet.sui.io:443';
const faucetUrl = getFaucetHost('devnet');

// create a new SuiClient object pointing to the network you want to use
const suiClient = new SuiClient({ url: url });

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

var performedPerGame = {};


const wasmPaths = {
    pubKey: 'wasm/pubkey.wasm',
    add: 'wasm/add.wasm',
    encryptShuffle: 'wasm/encrypt_shuffle.wasm',
    zeroEncrypt: 'wasm/zero_encrypt.wasm',
    decrypt: 'wasm/decrypt.wasm',
    reveal: 'wasm/reveal.wasm',
}

const zkeys = {
    pubKeyZkey: 'zkey/pubkey_0001.zkey',
    addZkey: 'zkey/add_0001.zkey',
    encryptShuffleZkey: 'zkey/encrypt_shuffle_0001.zkey',
    zeroEncryptZkey: 'zkey/zero_encrypt_0001.zkey',
    decryptZkey: 'zkey/decrypt_0001.zkey',
    revealZkey: 'zkey/reveal_0001.zkey',
}


const cachedZeroEncrypts = {};
const computingZeroEncrypts = {};

function randomScalars(sz) {
    var rands = [];
    for (var i=0; i<sz; i++) {
        const rand = getRandomScalar(js_crypto_1.babyJub.subOrder).toString();
        rands.push(rand);
    }
    return rands;
}

const computeZeroEncrypts = (async function (game_id: string,
    gameState: GameState) {
    const pubKeyX = gameState.group_public_key.fields.x;
    const pubKeyY = gameState.group_public_key.fields.y;
    var rands = randomScalars(52);
    const snarkjs = require("snarkjs");

    const {proof, publicSignals} = await snarkjs.groth16.fullProve({randomVal: rands.map(x => {return BigInt(x);}),
        pubKey_x: BigInt(pubKeyX), pubKey_y: BigInt(pubKeyY) }, wasmPaths.zeroEncrypt, zkeys.zeroEncryptZkey);
    const localZeroEncrypts = zeroEncryptLocal(rands, pubKeyX, pubKeyY);
    const proofZeroEncrypt_obj = {pubKeyX: pubKeyX, pubKeyY: pubKeyY, rands: rands,
        zeroEncrypts: localZeroEncrypts,
        proof: proof, publicSignals: publicSignals};
    cachedZeroEncrypts[game_id] = proofZeroEncrypt_obj;
});

const cachedZeroEncryptIsValid = (gameState: GameState, cachedZeroEncrypt: any) => {
    return cachedZeroEncrypt && cachedZeroEncrypt.pubKeyX === gameState.group_public_key.fields.x &&
    cachedZeroEncrypt.pubKeyY === gameState.group_public_key.fields.y;
}


const botLoop = (async function() {
    const configFile = process.argv.slice(2)[0];
    const config = JSON.parse(fs.readFileSync(`bot_config/${configFile}`, 'utf8'));
    const privateKey = config.privateKey;
    const gamesToPlay = config.gamesToPlay;
    const mnemonic = config.seed;
    const addressIndex = config.addressIndex;
    const keypair = Secp256k1Keypair.deriveKeypair(mnemonic, `m/54'/784'/0'/0/${addressIndex}`);
    const publicKey = keypair.getPublicKey().toSuiAddress();

    const balance = await suiClient.getBalance({ owner: publicKey });
    const totalBalance = parseInt(balance.totalBalance);
    var adminState = await getAdminState(PACKAGE_ADDRESS, suiClient, ADMIN_ADDRESS);
    const games = findAllObjects(PACKAGE_ADDRESS, GameObject.GameV2, {}, adminState);

    var actions: Action[] = [];

    var gameStates = {};

    for (const game of games) {
        // @ts-ignore
        if (!gamesToPlay.some(item => item === game.fields.id.id)) {
            continue;
        }
        // @ts-ignore
        var gameState = await getGame(suiClient, game.fields.id.id);
        // @ts-ignore
        gameStates[game.fields.id.id] = gameState;
        var playerStates;
        if (gameState.started) {
            playerStates = await getPlayerStates(PACKAGE_ADDRESS, suiClient, gameState.players);
        }
        else {
            playerStates = new Map();
        }
        var gameActions = getAction(PACKAGE_ADDRESS, gameState, playerStates, adminState, publicKey);
        actions = actions.concat(gameActions);
    }
    var didAction = false;
    var txb = new TransactionBlock();
    const performedActions: Action[] = [];
    const decimals = 9;

    var performedGameIds = [];
    for (const action of actions) {
        if (action.from === publicKey) {
            const gameId = action.payload.gameId;
            if (performedGameIds.some(item => item === gameId)) {
                continue;
            }
            const gameState: GameState = gameStates[gameId];
            const cachableActions = [ActionType.SHUFFLE];

            if (!cachableActions.some(item => item === action.type)) {
                if (!computingZeroEncrypts[gameId] &&
                gameState && gameState.group_public_key && gameState.group_public_key.fields &&
                gameState.group_public_key.fields.x !== "0" && gameState.group_public_key.fields.y !== "1"
                && !(cachedZeroEncryptIsValid(gameState, cachedZeroEncrypts[gameId]))
                ) {
                    delete cachedZeroEncrypts[gameId];
                    computingZeroEncrypts[gameId] = true;
                    computeZeroEncrypts(gameId, gameState)
                    .finally(() => {
                        computingZeroEncrypts[gameId] = false;
                    });
                }
            }


            const doableActions = [ActionType.JOIN, ActionType.SHUFFLE, ActionType.DECRYPT, ActionType.BET, ActionType.DECRYPT_MANY, ActionType.BLIND_BET];
            if (doableActions.some(item => item === action.type)) {
            } else {
                continue;
            }

            if (performedPerGame[action.payload.gameId] && actionsAreSame(performedPerGame[action.payload.gameId], action)) {
                console.log(`skipping already performed action: ${JSON.stringify(action)}`);
                continue;
            }

            var deleteCachedZeroEncrypt = false;

            if (action.inputs) {
                if (action.type === ActionType.JOIN) {
                    const takenSeats = [...gameState.player_seats];
                    if (takenSeats.length)
                    // find a seat not in takenSeats
                    var seat = null;
                    const useSeats = [0,2,3,5,6];
                    for (var i = 0; i < 8; i++) {
                        if (!takenSeats.some(item => item === i) && useSeats.some(item => item === i)) {
                            seat = i;
                            break;
                        }
                    }
                    if (seat === null) {
                        continue;
                    }

                    if (totalBalance < 5 * parseInt(gameState.big_blind)) {
                        console.log("not enough balance to join, requesting from faucet...");
                        await requestSuiFromFaucetV0({
                            host: faucetUrl,
                            recipient: publicKey,
                        });
                        continue;
                    }
                    const usableTokenBalance = (totalBalance - 1000000000) / (10 ** decimals);
                    // round to 3 decimals
                    const usableBalanceRounded = Math.round(usableTokenBalance * 1000) / 1000;
                    const usableBalance = usableBalanceRounded * (10 ** decimals);

                    action.payload.balance = usableBalance;
                    action.payload.seat = seat;
                }
                else if (action.type === ActionType.SHUFFLE) {
                    action.payload.proofZeroEncrypt = null;
                    if (cachedZeroEncrypts[gameId]) {
                        const cachedZeroEncrypt = cachedZeroEncrypts[gameId];
                        if (cachedZeroEncrypt.pubKeyX === gameState.group_public_key.fields.x &&
                        cachedZeroEncrypt.pubKeyY === gameState.group_public_key.fields.y) {
                            action.payload.proofZeroEncrypt = cachedZeroEncrypt;
                            deleteCachedZeroEncrypt = true;

                        }
                    }
                }
                else if (action.type === ActionType.BET) {
                    const parsedGameState = parseGameState(gameState);
                    const canCall = parsedGameState.availableActions.includes(BetType.CALL);
                    const canBet = parsedGameState.availableActions.includes(BetType.BET);
                    const canCheck = parsedGameState.availableActions.includes(BetType.CHECK);

                    const ownState = parsedGameState.playerStates[publicKey];
                    
                    const ownBet = ownState.bet ? ownState.bet : 0;
                    const raiseAmount = parsedGameState.raiseAmount;
                    const maxBet = (ownState.balance + ownBet) / (10 ** decimals);
                    const minBet = Math.min(maxBet, (ownBet + parsedGameState.callAmount + raiseAmount) / (10 ** decimals));

                    const myRandom = Math.random();
                    const haveBalanceForBet = totalBalance >= minBet * (10 ** decimals);
                    if (!haveBalanceForBet) {
                        console.log("not enough balance to bet, requesting from faucet...");
                        await requestSuiFromFaucetV0({
                            host: faucetUrl,
                            recipient: publicKey,
                        });
                        continue;
                    }

                    if (canCheck && canBet && haveBalanceForBet) {
                        if (myRandom < 0.5) {
                            action.payload.betType = BetType.CHECK;
                            action.payload.amount = 0;
                        } else {
                            const betAmount = minBet;
                            const partialAmount = Math.round(betAmount * (10 ** decimals)) - (ownState.bet ? ownState.bet : 0);
                            action.payload.betType = BetType.BET;
                            action.payload.amount = partialAmount;
                        }
                    } else if (canCheck) {
                        action.payload.betType = BetType.CHECK;
                        action.payload.amount = 0;
                    } else {
                        if (!canCall) {
                            throw new Error("cannot call");
                        }
                        if (myRandom < 0.2) {
                            action.payload.betType = BetType.FOLD;
                            action.payload.amount = 0;
                        } else {
                            action.payload.betType = BetType.CALL;
                            action.payload.amount = parsedGameState.callAmount;
                        }
                    }
                }
            }
            didAction = await handleAction(PACKAGE_ADDRESS, txb, action,  privateKey, wasmPaths, zkeys);
            if (!didAction) {
                continue;
            } else {
                performedActions.push(action);
                if (deleteCachedZeroEncrypt) {
                    delete cachedZeroEncrypts[action.payload.gameId];
                }
            }
            performedGameIds.push(action.payload.gameId);
            break;
        }
    };
    if (!didAction) {
        return;
    }
    try {
        await suiClient.signAndExecuteTransactionBlock({ signer: keypair, transactionBlock: txb });
    } catch (e) {
        console.log('error: ' + e);
    }
});


(async () => {
    try {
        while (true) {
            await botLoop();
            await sleep(500);
        }
    } catch (e) {
        console.log('error: ' + e);
        // Deal with the fact the chain failed
    }
})();
