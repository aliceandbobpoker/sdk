import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Secp256k1Keypair } from '@mysten/sui.js/keypairs/secp256k1';
import { getGame, findAllObjects, returnBet, GameObject,
    getAdminState, getPlayerStates, getAction, Action, handleAction, ActionType,     
} from './Game';

import { PACKAGE_ADDRESS } from './constants';
const MNEMONIC = "matter beef menu raw gather scheme legend oblige soup sponsor receive face";
const keypair = Secp256k1Keypair.deriveKeypair(MNEMONIC);
const ADMIN_ADDRESS = '0x70cba2254a6c73a68e2ad3f079e7f14c4233d5dfb4dc0f3c519321c843903cab';

const url =  'https://fullnode.devnet.sui.io:443';
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

const adminLoop = (async function() {
    var adminState = await getAdminState(PACKAGE_ADDRESS, suiClient, ADMIN_ADDRESS);
    const games = findAllObjects(PACKAGE_ADDRESS, GameObject.GameV2, {}, adminState);
    var actions: Action[] = [];

    for (const game of games) {
        // @ts-ignore
        var gameState = await getGame(suiClient, game.fields.id.id);
        var playerStates;
        // only need to get player states if the game has started and the deck is empty
        if (gameState.started && gameState.deck.length == 0) {
            playerStates = await getPlayerStates(PACKAGE_ADDRESS, suiClient, gameState.players);
        }
        else {
            playerStates = new Map();
        }
        var gameActions = getAction(PACKAGE_ADDRESS, gameState, playerStates, adminState, '');
        actions = actions.concat(gameActions);
    }
    // console.log(`actions: ${JSON.stringify(actions)}`);

    var didAction = false;
    const compareActions = (a, b) => {
        return JSON.stringify(a) === JSON.stringify(b);
    };
    var txb = new TransactionBlock();

    const performedActions: Action[] = [];

    var gameIds = [];
    for (const action of actions) {
        if (action.admin) {
            if (gameIds.some(item => item === action.payload.gameId)) {
                continue;
            }
            console.log(`************************* action: ${JSON.stringify(action)}`);
            if (performedPerGame[action.payload.gameId] && compareActions(performedPerGame[action.payload.gameId], action)) {
                console.log(`skipping already performed action: ${JSON.stringify(action)}`);
                continue;
            }

            performedPerGame[action.payload.gameId] = action;
            didAction = await handleAction(PACKAGE_ADDRESS, txb, action, null, wasmPaths, zkeys);
            if (!didAction) {
                continue;
            } else {
                performedActions.push(action);
            }
            gameIds.push(action.payload.gameId);
            break;
        }
    };
    if (!didAction) {
        return;
    }
    try {
        var tx_result = await suiClient.signAndExecuteTransactionBlock({ signer: keypair, transactionBlock: txb });
        console.log(`tx_result: ${JSON.stringify(tx_result)}`);
    } catch (e) {
        console.log('error: ' + e);
        for (const action of performedActions) {
            if (action.type === ActionType.ADD_BET) {
                console.log('returning bet');
                var txb = new TransactionBlock();
                await returnBet(PACKAGE_ADDRESS, txb, action.payload.objId);
                var tx_result = await suiClient.signAndExecuteTransactionBlock({ signer: keypair, transactionBlock: txb });
                console.log(`tx_result: ${JSON.stringify(tx_result)}`);
            }
        }
    }
});

(async () => {
    try {
        while (true) {
            await adminLoop();
            await sleep(500);
        }
    } catch (e) {
        console.log('error: ' + e);
    }
})();