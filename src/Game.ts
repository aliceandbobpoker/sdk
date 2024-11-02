// src/gameLogic.ts
import { SuiClient, MoveStruct } from '@mysten/sui.js/client';
import { BCS, getSuiMoveConfig } from "@mysten/bcs";
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { babyJub } from '@iden3/js-crypto';

import { proofToBytes, BigIntsToBytes, unstringifyBigInts, getRandomScalar} from './Crypto';
const circomlib = require("circomlibjs");

const buildBn128Node = (typeof window === 'undefined') ? require('ffjavascript').buildBn128 : null;

const REVEAL_LENGTH = 5;
const PUBLIC_IDX = 255;
const NUM_ROUNDS = 4;

// @ts-ignore
const snarkjs = (typeof window === 'undefined') ? require("snarkjs") : window.snarkjs;

const PACKAGE_NAME = 'game';

export enum GameObject {
  JoinGame = `${PACKAGE_NAME}::JoinGame`,
  LeaveGame = `${PACKAGE_NAME}::LeaveGame`,
  Game = `${PACKAGE_NAME}::Game`,
  GameV2 = `${PACKAGE_NAME}::GameV2`,
  ShuffledDeck = `${PACKAGE_NAME}::ShuffledDeck`,
  PartialDecryptV2 = `${PACKAGE_NAME}::PartialDecryptV2`,
  PartialDecryptMany = `${PACKAGE_NAME}::PartialDecryptMany`,
  StartGame = `${PACKAGE_NAME}::StartGame`,
  EncFragment = `${PACKAGE_NAME}::EncFragment`,
  Betless = `${PACKAGE_NAME}::Betless`,
  Bet = `${PACKAGE_NAME}::Bet`,
}

export function formatGameObject(packageId: string, objectType: GameObject) {
  return `${packageId}::${objectType}`;
}

export function isGameObject(obj: string, packageId: string, objectType: GameObject) {
  return obj === `${packageId}::${objectType}`;
}

export enum GameEvent {
  BetEvent = `${PACKAGE_NAME}::BetEvent`,
  AddBetEvent = `${PACKAGE_NAME}::AddBetEvent`,
  FoldEvent = `${PACKAGE_NAME}::FoldEvent`,
  AddFoldEvent = `${PACKAGE_NAME}::AddFoldEvent`,
  CheckEvent = `${PACKAGE_NAME}::CheckEvent`,
  AddCheckEvent = `${PACKAGE_NAME}::AddCheckEvent`,
  AddPlayerEvent = `${PACKAGE_NAME}::AddPlayerEvent`,
  AddDecryptEvent = `${PACKAGE_NAME}::AddDecryptEvent`,
  RevealEvent = `${PACKAGE_NAME}::RevealEvent`,
  PayoutEvent = `${PACKAGE_NAME}::PayoutEvent`,
  NewHandEvent = `${PACKAGE_NAME}::NewHandEvent`,
  ResetEvent = `${PACKAGE_NAME}::ResetEvent`,
  ShuffleEvent = `${PACKAGE_NAME}::ShuffleEvent`,
  RemovePlayerEvent = `${PACKAGE_NAME}::RemovePlayerEvent`,
  JoinEvent = `${PACKAGE_NAME}::JoinEvent`,
  LeaveEvent = `${PACKAGE_NAME}::LeaveEvent`,
}

export function parseGameEvent(eventString: string, packageId: string) : GameEvent | null {
  if (eventString === `${packageId}::${PACKAGE_NAME}::BetEvent`) {
    return GameEvent.BetEvent;
  } else if (eventString === `${packageId}::${PACKAGE_NAME}::AddBetEvent`) {
    return GameEvent.AddBetEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::FoldEvent`) {
    return GameEvent.FoldEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::AddFoldEvent`) {
    return GameEvent.AddFoldEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::CheckEvent`) {
    return GameEvent.CheckEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::AddCheckEvent`) {
    return GameEvent.AddCheckEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::AddPlayerEvent`) {
    return GameEvent.AddPlayerEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::AddDecryptEvent`) {
    return GameEvent.AddDecryptEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::RevealEvent`) {
    return GameEvent.RevealEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::PayoutEvent`) {
    return GameEvent.PayoutEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::NewHandEvent`) {
    return GameEvent.NewHandEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::ResetEvent`) {
    return GameEvent.ResetEvent;  
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::ShuffleEvent`) {
    return GameEvent.ShuffleEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::RemovePlayerEvent`) {
    return GameEvent.RemovePlayerEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::JoinEvent`) {
    return GameEvent.JoinEvent;
  }
  else if (eventString === `${packageId}::${PACKAGE_NAME}::LeaveEvent`) {
    return GameEvent.LeaveEvent;
  }
  else {
    return null;
  }
}


export enum BetTypeInt {
  CALL = 0,
  BET = 2,
  BLIND_BET = 5,
}

export enum BetType {
  CALL = 'call',
  BET = 'bet',
  FOLD = 'fold',
  CHECK = 'check',
  BLIND_BET = 'blind_bet',
}

export enum BetlessType {
  FOLD = 'fold',
  CHECK = 'check',
}

export enum ActionType {
  JOIN = 'join',
  ADD_PLAYER = 'add_player',
  REMOVE_BUST_PLAYER = 'remove_bust_player',
  REMOVE_PLAYER = 'remove_player',
  LEAVE = 'leave',
  START = 'start',
  INIT = 'init',
  SHUFFLE_PLAIN = 'shuffle_plain',
  SHUFFLE = 'shuffle',
  COMPLETE_SHUFFLE = 'complete_shuffle',
  DECRYPT = 'decrypt',
  // ADD_DECRYPT = 'add_decrypt',
  ADD_MULTIPLE_DECRYPT = 'add_multiple_decrypt',
  DECRYPT_MANY = 'decrypt_many',
  // ADD_DECRYPT_MANY = 'add_decrypt_many',
  ADD_MULTIPLE_DECRYPT_MANY = 'add_multiple_decrypt_many',
  REVEAL = 'reveal',
  REVEAL_MANY = 'reveal_many',
  BET_ACTION = 'bet_action',
  BLIND_BET = 'blind_bet',
  BET = 'bet',
  ADD_BET = 'add_bet',
  ADD_BETLESS = 'add_betless',
  FIND_WINNER = 'find_winner',
  RESET_GAME = 'reset_game',
}

export type PrivateState = {
  privateKey: string,
  publicKey: Point,
  player: string,
}

export type Action = {
  type: ActionType,
  admin: boolean,
  from?: string,
  payload?: any,
  inputs?: string[],
  key?: string[]
}

export type CardState = {
  card: number, 
  revealed: boolean,
  decrypted?: boolean,
}

export type GameState = {
  [key: string]: any
}

export type PlayerState = {
  cards: CardState[],
  balance: number,
  seat: number,
  isInHand: boolean,
  bet?: number,
}

export type ParsedGameState = {
  players: string[],
  playerStates: {
    [player: string]: PlayerState
  },
  publicState: CardState[],
  pots: number[],
  betPlayer: string,
  callAmount: number,
  betAmount: number,
  raiseAmount: number,
  betRound: number,
  availableActions: BetType[],
  bigBlind: number,
  smallBlind: number,
  buttonIdx: number,
  smallBlindIdx: number,
  bigBlindIdx: number,
}

export type Point = {
  x: string,
  y: string,
}

export type CompressedPoint = {
  x: string,
  flag: boolean,
}

export type CipherText = {
  c1: Point,
  c2: Point,
}

export type CompressedCipherText = {
  c1x: string,
  c2x: string,
  c1flag: boolean,
  c2flag: boolean,
}

export type CompCipherTexts = {
  c1x: string[],
  c2x: string[],
  flags: string,
}


export type EncFragment = {
  id: string,
  cardIdx: number,
  from: string,
  cipherText: CipherText,
}

export type Permutation = number[][];

export type ParsedHand = {
  cards: number[],
}

type MoveObject = {
  dataType: 'moveObject';
  fields: MoveStruct;
  hasPublicTransfer: boolean;
  type: string;
}

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));



export enum CardSuit {
  Spades = "S",
  Clubs = "C",
  Hearts = "H",
  Diamonds = "D",
}

export enum CardRank {
  Ace = "A",
  King = "K",
  Queen = "Q",
  Jack = "J",
  Ten = "T",
  Nine = "9",
  Eight = "8",
  Seven = "7",
  Six = "6",
  Five = "5",
  Four = "4",
  Three = "3",
  Two = "2",
}

export function cardToReadable(card: number): [CardSuit, CardRank] {
  const suit = Math.floor(card / 13);
  const rank = card % 13;

  const cardSuit = suit === 0 ? CardSuit.Spades : suit === 1 ? CardSuit.Clubs : suit === 2 ? CardSuit.Hearts : CardSuit.Diamonds;
  const cardRank = rank === 0 ? CardRank.Ace : rank === 1 ? CardRank.King : rank === 2 ? CardRank.Queen : rank === 3 ? CardRank.Jack : rank === 4 ? CardRank.Ten : rank === 5 ? CardRank.Nine : rank === 6 ? CardRank.Eight : rank === 7 ? CardRank.Seven : rank === 8 ? CardRank.Six : rank === 9 ? CardRank.Five : rank === 10 ? CardRank.Four : rank === 11 ? CardRank.Three : CardRank.Two;
  return [cardSuit, cardRank];
}

export function privateToPublic(privateKey: string): Point {
  var gz = babyJub.mulPointEscalar(babyJub.Base8, BigInt(privateKey));
  return {
    x: gz[0].toString(),
    y: gz[1].toString(),
  }
}

export function applyDecrypts(cipherText: CipherText, decrypts: Point[]): number {
  var c1 = [BigInt(cipherText.c1.x), BigInt(cipherText.c1.y)];
  var c2 = [BigInt(cipherText.c2.x), BigInt(cipherText.c2.y)];
  const field = babyJub.F;
  for (const decrypt of decrypts) {
    const negDecrypt = [field.neg(BigInt(decrypt.x)), BigInt(decrypt.y)];
    c2 = babyJub.addPoint(c2, negDecrypt);
  }
  const outPoint = {
    x: c2[0].toString(),
    y: c2[1].toString(),
  };
  const deck = getPlainDeck(52);
  const card = findPointInDeck(deck, outPoint);
  return card;
}

export function privateDecrypt(cipherText: CipherText, decrypts: Point[], privateKey: string): number {
  var c1 = [BigInt(cipherText.c1.x), BigInt(cipherText.c1.y)];
  var c2 = [BigInt(cipherText.c2.x), BigInt(cipherText.c2.y)];
  const field = babyJub.F;
  for (const decrypt of decrypts) {
    const negDecrypt = [field.neg(BigInt(decrypt.x)), BigInt(decrypt.y)];
    c2 = babyJub.addPoint(c2, negDecrypt);
  }
  const c1mul = babyJub.mulPointEscalar(c1, BigInt(privateKey));
  const negc1mul = [field.neg(BigInt(c1mul[0])), BigInt(c1mul[1])];
  const c2add = babyJub.addPoint(c2, negc1mul);
  const outPoint = {
    x: c2add[0].toString(),
    y: c2add[1].toString(),
  }
  const deck = getPlainDeck(52);
  const card = findPointInDeck(deck, outPoint);
  return card;
}

export function parseCardBits(handBits: number): ParsedHand {
  var cards = [];
  var i = 0;
  var bits = BigInt(handBits);
  while (bits > 0) {
    const rem = bits & BigInt(1);
    if (rem == BigInt(1)) {
      cards.push(i);
    }
    bits = bits >> BigInt(1);
    i = i + 1;
  }
  return {
    cards: cards,
  };
}


export function parseGameState(gameState: GameState, privateState?: PrivateState): ParsedGameState {
  var playerStates = {};
  var publicState = [];
  const players = gameState.players;
  const rounds = gameState.rounds;
  const deck = gameState.deck;
  const balances = gameState.player_balances;
  const currentBets = gameState.current_bets;
  const playerSeats = gameState.player_seats;
  const current_hand_players = gameState.current_hand_players;
  for (const [i, player] of players.entries()) {
    const balance = parseInt(balances[i]);
    const bet = parseInt(currentBets[i]);
    playerStates[player] = {
      cards: [],
      balance: balance,
      bet: bet,
      seat: parseInt(playerSeats[i]),
      isInHand: current_hand_players.includes(i),
    };
  }
  var k = 0 ;
  for (var i = 0; i < rounds.length; i++) {
    for (var j = 0; j < rounds[i].length; j++) {
      const card = deck[k];
      const playerIdx = rounds[i][j];
      const cipherText = {
        c1: decompressPoint(
          BigInt(card.fields.cipher_text.fields.c1.fields.x),
          card.fields.cipher_text.fields.c1.fields.flag
        ),
        c2: decompressPoint(
          BigInt(card.fields.cipher_text.fields.c2.fields.x),
          card.fields.cipher_text.fields.c2.fields.flag
        ),
      };
      const decrypts = card.fields.decrypts.map((decrypt) => {
        return {
          x: decrypt.fields.x,
          y: decrypt.fields.y,
        };
      });
      if (playerIdx == PUBLIC_IDX) {
        const cardState = {
          card: card.fields.reveal_card,
          revealed: card.fields.revealed,
          decrypted: false,
        };
        if (card.fields.revealable && (!card.fields.revealed)) {
          const cardNumber = applyDecrypts(cipherText, decrypts);
          cardState.decrypted = true;
          cardState.revealed = true;
          cardState.card = cardNumber;
        };
        publicState.push(cardState);
      } else {
        const player = players[playerIdx];
        const cardState: CardState = {
          card: card.fields.reveal_card,
          revealed: card.fields.revealed,
        };
        if ((card.fields.completed_decrypt) && (!card.fields.revealed)) {
          if (card.fields.revealable) {
            const cardNumber = applyDecrypts(cipherText, decrypts);
            cardState.decrypted = true;
            cardState.revealed = true;
            cardState.card = cardNumber;
          } else if (player == privateState?.player) {
            const cardNumber = privateDecrypt(cipherText, decrypts, privateState.privateKey);
            cardState.decrypted = true;
            cardState.revealed = true;
            cardState.card = cardNumber;            
          }
        }
        playerStates[player].cards.push(cardState);
      }
      k = k + 1;
    }
  }
  // for (const [i, player] of players.entries()) {
  //   const balance = balances[i];
  //   playerStates[player].balance = balance;
  // }

  const betPlayerIdx = gameState.bet_player;
  const betPlayer = players[betPlayerIdx];
  const betPlayerBet = parseInt(currentBets[betPlayerIdx]);
  const betPlayerBalance = parseInt(balances[betPlayerIdx]);
  const currentBet = parseInt(gameState.current_bet);
  const raiseAmount = parseInt(gameState.raise_amount);
  const callAmount = Math.min(betPlayerBalance, currentBet - betPlayerBet);

  var availableActions = [];
  if (callAmount > 0) {
    availableActions.push(BetType.CALL);
  } else {
    availableActions.push(BetType.CHECK);
  }
  if (betPlayerBalance > callAmount) {
    availableActions.push(BetType.BET);
  }
  // availableActions.push(BetType.BET);
  availableActions.push(BetType.FOLD);

  const buttonIdx = parseInt(gameState.button_idx);
  const smallBlindIdx = players.length == 2 ? buttonIdx : (buttonIdx + 1) % players.length;
  const bigBlindIdx = players.length == 2 ? (buttonIdx + 1) % players.length : (buttonIdx + 2) % players.length;

  return {
    players: players,
    playerStates: playerStates,
    publicState: publicState,
    // TODO: fix this
    pots: [parseInt(gameState.pot)],
    betPlayer: betPlayer,
    callAmount: callAmount,
    betAmount: currentBet,
    raiseAmount: raiseAmount,
    betRound: gameState.bet_round,
    availableActions: availableActions,
    bigBlind: parseInt(gameState.big_blind),
    smallBlind: parseInt(gameState.small_blind),
    buttonIdx: parseInt(gameState.button_idx),
    smallBlindIdx: smallBlindIdx,
    bigBlindIdx: bigBlindIdx,
  }
}

export function parsePoint(point: MoveStruct) : Point {
  return {
    // @ts-ignore
    x: point.fields.x,
    // @ts-ignore
    y: point.fields.y,
  }
}

export function parseCipherText(cipherText: MoveStruct) : CipherText {
  return {
    // @ts-ignore
    c1: parsePoint(cipherText.fields.c1),
    // @ts-ignore
    c2: parsePoint(cipherText.fields.c2),
  }
}

export function parseFragment(fragment: MoveStruct) : EncFragment {
  return {
    // @ts-ignore
    id: fragment.fields.id.id,
    // @ts-ignore
    cardIdx: fragment.fields.card_idx,
    // @ts-ignore
    from: fragment.fields.from,
    // @ts-ignore
    cipherText: parseCipherText(fragment.fields.cipher_text),
  }
}

function getPlainDeckUncached(n: number): CipherText[] {
  var deck = [];
  var curr = babyJub.Base8;
  for (var i = 0; i < n; i++) {
    var ct = {
      c1: {
        x: "0",
        y: "1",
      },
      c2: {
        x: curr[0].toString(),
        y: curr[1].toString(),
      }
    };
    deck.push(ct);
    curr = babyJub.addPoint(curr, babyJub.Base8);
  }
  return deck;
}

const getPlainDeckCached = () => {
  let cache = {};
  return (n: number): CipherText[] => {
    if (n in cache) {
      return cache[n];
    } else {
      const deck = getPlainDeckUncached(n);
      cache[n] = deck;
      return deck;
    }
  }
}

export const getPlainDeck = getPlainDeckCached();

function findPointInDeck(deck: CipherText[], point: Point): number | null {
  for (var i = 0; i < deck.length; i++) {
    var ct = deck[i];
    if (ct.c2.x == point.x && ct.c2.y == point.y) {
      return i;
    }
  }
  return null;
}

// export function findCompressedPointInDeck(deck: CipherText[], compressed: CompressedPoint): number | null {
//   const point = decompressPoint(BigInt(compressed.x), compressed.flag);
//   return findPointInDeck(deck, point);
// }

export async function hashCipherTexts(cipherTexts: CompCipherTexts) {
  const {proof, publicSignals} = await snarkjs.groth16.fullProve({
    c1x: cipherTexts.c1x.map((c1) => {return BigInt(c1)}),
    c2x: cipherTexts.c2x.map((c1) => {return BigInt(c1)}),
    flags: BigInt(cipherTexts.flags),
    }, "hash_compressed.wasm", "hash_compressed_0001.zkey");
  console.log({ proof, publicSignals });
}

export async function hashUncompCipherTexts(cipherTexts: CipherText[]) {
  const {proof, publicSignals} = await snarkjs.groth16.fullProve({
    c1x: cipherTexts.map((ct) => {return BigInt(ct.c1.x)}),
    c1y: cipherTexts.map((ct) => {return BigInt(ct.c1.y)}),
    c2x: cipherTexts.map((ct) => {return BigInt(ct.c2.x)}),
    c2y: cipherTexts.map((ct) => {return BigInt(ct.c2.y)}),
    }, "hash_uncompressed.wasm", "hash_uncompressed_0001.zkey");
  console.log({ proof, publicSignals });
}

export async function hashCipherTextsLocal(cipherTexts: CompCipherTexts, m1: number, num1: number, m2: number, num2: number): Promise<BigInt> {
  var poseidon = await circomlib.buildPoseidonOpt();
  var flattened = [];
  for (const c1 of cipherTexts.c1x) {
    flattened.push(c1);
  }
  for (const c2 of cipherTexts.c2x) {
    flattened.push(c2);
  }
  flattened.push(cipherTexts.flags);

  var first_round = [];
  var second_round = [];

  for (var i = 0; i < m1; i ++) {
    var inputs = [];
    for (var j = 0; j < num1; j ++ ) {
      inputs.push(flattened[i * num1 + j]);
    }
    var output = poseidon(inputs);
    first_round.push(output);
  }

  for (var i = 0; i < m2; i ++) {
    var inputs = [];
    for (var j = 0; j < num2; j ++ ) {
      inputs.push(first_round[i * num2 + j]);
    }
    var output = poseidon(inputs);
    second_round.push(poseidon.F.toObject(output));
  }
  return poseidon.F.toObject(poseidon(second_round));
}

export async function hashUncompCipherTextsLocal(cipherTexts: CipherText[], m1: number, num1: number, m2: number, num2: number): Promise<BigInt> {
  var poseidon = await circomlib.buildPoseidonOpt();
  var flattened = [];
  for (const ct of cipherTexts) {
    flattened.push(ct.c1.x);
  }
  for (const ct of cipherTexts) {
    flattened.push(ct.c1.y);
  }
  for (const ct of cipherTexts) {
    flattened.push(ct.c2.x);
  }
  for (const ct of cipherTexts) {
    flattened.push(ct.c2.y);
  }

  var first_round = [];
  var second_round = [];
  var input_length;

  for (var i = 0; i < m1; i ++) {
    var inputs = [];
    if (i == m1 - 1) {
      input_length = flattened.length - i * num1;
    } else {
      input_length = num1;
    }
    for (var j = 0; j < input_length; j ++ ) {
      inputs.push(flattened[i * num1 + j]);
    }
    var output = poseidon(inputs);
    first_round.push(output);
  }

  for (var i = 0; i < m2; i ++) {
    var inputs = [];
    if (i == m2 - 1) {
      input_length = m1 - i * num2;
    } else {
      input_length = num2;
    }
    for (var j = 0; j < input_length; j ++ ) {
      inputs.push(first_round[i * num2 + j]);
    }
    var output = poseidon(inputs);
    second_round.push(poseidon.F.toObject(output));
  }
  if (m2 == 1) {
    return second_round[0];
  } else {
    return poseidon.F.toObject(poseidon(second_round));
  }
}

export function compressCipherTexts(cipherTexts: CipherText[]): CompCipherTexts {
  var c1xs = [];
  var c2xs = [];
  var flags = [];
  for (var i = 0; i < cipherTexts.length; i++) {
    var cipherText = cipherTexts[i];
    var c1x = cipherText.c1.x;
    var c1y = cipherText.c1.y;
    c1xs.push(c1x);
    var c1flag = BigInt(c1y) > BigInt("10944121435919637611123202872628637544274182200208017171849102093287904247808");
    flags.push(c1flag ? "1" : "0");
    var c2x = cipherText.c2.x;
    var c2y = cipherText.c2.y;
    c2xs.push(c2x);
    var c2flag = BigInt(c2y) > BigInt("10944121435919637611123202872628637544274182200208017171849102093287904247808");
    flags.push(c2flag ? "1" : "0");
  }
  flags.reverse();
  return {
    c1x: c1xs,
    c2x: c2xs,
    flags: BigInt('0b' + flags.join("")).toString(),
  }
}

export function serializeUncompressedDeck(deck: CipherText[]): Uint8Array {
  var serInputs = [];
  for (var i = 0; i < deck.length; i++) {
    serInputs.push(BigInt(deck[i].c1.x));
    serInputs.push(BigInt(deck[i].c1.y));
    serInputs.push(BigInt(deck[i].c2.x));
    serInputs.push(BigInt(deck[i].c2.y));
  }
  var bytes = BigIntsToBytes(serInputs);
  return bytes
}


export function serializeCompressedDeck(compressed: CompCipherTexts): Uint8Array {
  var serInputs = [];
  serInputs.push(BigInt(compressed.flags));
  for (var i = 0; i < compressed.c1x.length; i++) {
    serInputs.push(BigInt(compressed.c1x[i]));
    serInputs.push(BigInt(compressed.c2x[i]));
  }
  var bytes = BigIntsToBytes(serInputs);
  return bytes
}

export function invertPoint(p: Point): Point {
  return {
    x: babyJub.F.neg(BigInt(p.x)).toString(),
    y: p.y,
  }
}

export function decompressPoint(x: bigint, flag: boolean): Point {
  if (x == BigInt(0)) {
    return {
      x: "0",
      y: "1",
    }
  }
  const field = babyJub.F;
  const x2 = field.mul(x, x);
  const ax2m1 = field.sub(field.mul(babyJub.A, x2), BigInt(1));
  const dx2m1 = field.sub(field.mul(babyJub.D, x2), BigInt(1));
  const dx2m1in = field.inv(dx2m1);
  const y2 = field.mul(ax2m1, dx2m1in);
  const y = field.sqrt(y2);
  const yNeg = field.neg(y);
  var yOut: bigint;
  if (flag) {
    yOut = (y > yNeg) ? y : yNeg;
  }
  else {
    yOut = (y > yNeg) ? yNeg : y;
  }
  return {
    x: x.toString(),
    y: yOut.toString(),
  }
}

export function compressPoint(point: Point): CompressedPoint {
  const field = babyJub.F;
  const y = BigInt(point.y);
  const yNeg = field.neg(y);
  const flag = (y > yNeg);
  return {
    x: point.x,
    flag: flag,
  }
}

export function decompressCipherText(compressed: CompressedCipherText): CipherText {
  var c1 = decompressPoint(BigInt(compressed.c1x), compressed.c1flag);
  var c2 = decompressPoint(BigInt(compressed.c2x), compressed.c2flag);
  return {
    c1: c1,
    c2: c2,
  }
}

export function decompressDeck(compressed: CompressedCipherText[]): CipherText[] {
  var cipherTexts = [];
  for (const comp of compressed) {
    const c1 = decompressPoint(BigInt(comp.c1x), comp.c1flag);
    const c2 = decompressPoint(BigInt(comp.c2x), comp.c2flag);
    const ct = {
      c1: c1,
      c2: c2,
    }
    cipherTexts.push(ct);
  }
  return cipherTexts;
}

function parseCompressedDeck(deckObj: MoveObject): CompressedCipherText[] {
  var compressed = [];
  // @ts-ignore
  const deck = deckObj.fields.deck;
  for (const comp of deck) {
    compressed.push({
      // @ts-ignore
      c1x: comp.fields.c1.fields.x,
      // @ts-ignore
      c2x: comp.fields.c2.fields.x,
      // @ts-ignore
      c1flag: comp.fields.c1.fields.flag,
      // @ts-ignore
      c2flag: comp.fields.c2.fields.flag,
    })
  }
  return compressed;
}

export function decompressDeserializeDeck(compressed: Uint8Array): CipherText[] {
  const bcs = new BCS(getSuiMoveConfig());
  const flagBytes = compressed.slice(0, 32);
  var flags = BigInt(bcs.de(BCS.U256, flagBytes));
  var cipherTexts = [];
  // @ts-ignore
  // var curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
  for (var i = 0; i < 52; i++) {
    const c1flag = (flags & BigInt(1)) === BigInt(1);
    flags = flags >> BigInt(1);
    const c2flag = (flags & BigInt(1)) === BigInt(1);
    flags = flags >> BigInt(1);    
    const c1xBytes = compressed.slice(32 + i * 64, 64 + i * 64);
    const c1x = bcs.de(BCS.U256, c1xBytes);
    const c2xBytes = compressed.slice(64 + i * 64, 96 + i * 64);
    const c2x = bcs.de(BCS.U256, c2xBytes);
    const c1 = decompressPoint(BigInt(c1x), c1flag);
    const c2 = decompressPoint(BigInt(c2x), c2flag);
    const ct = {
      c1: c1,
      c2: c2,
    }
    cipherTexts.push(ct);
  }
  return cipherTexts;
}


export async function proveZeroEncrypt(rands: string[], pubKeyX: string, pubKeyY: string, wasmPath: string, zkey: any, proofZeroEncrypt?: any): Promise<[any, any]> {
  var proof2use;
  var publicSignals2use;
  if (proofZeroEncrypt === null) {
    var useZkey;
    if (zkey == undefined) {
      // @ts-ignore
      const zeroEncryptZkey = (window.zeroEncryptZkey === undefined) ? await window.readExisting("/zero_encrypt_0001.zkey", 1<<25, 1<<23) : window.zeroEncryptZkey;
      // @ts-ignore
      window.zeroEncryptZkey = zeroEncryptZkey;
      useZkey = zeroEncryptZkey.o;
    } else {
      useZkey = zkey;
    }
    const {proof, publicSignals} = await snarkjs.groth16.fullProve({
        randomVal: rands.map((x) => {return BigInt(x)}),
        pubKey_x: BigInt(pubKeyX),
        pubKey_y: BigInt(pubKeyY),
    }, wasmPath, useZkey);
    proof2use = proof;
    publicSignals2use = publicSignals;

  } else {
    proof2use = proofZeroEncrypt.proof;
    publicSignals2use =  proofZeroEncrypt.publicSignals;
  }
  return [proof2use, publicSignals2use];
}

export function zeroEncryptLocal(rands: string[], pubKeyX: string, pubKeyY: string): CipherText[] {
  var cipherTexts = [];
  for (const rand of rands) {
    var gz = babyJub.mulPointEscalar(babyJub.Base8, BigInt(rand));
    var yz = babyJub.mulPointEscalar([BigInt(pubKeyX), BigInt(pubKeyY)], BigInt(rand));
    var cipherText = {
      c1: {
        x: gz[0].toString(),
        y: gz[1].toString(),
      },
      c2: {
        x: yz[0].toString(),
        y: yz[1].toString(),
      }
    };
    cipherTexts.push(cipherText);
  }
  return cipherTexts;
}

export function randomPermutation(size: number): Permutation {
  // Create a square matrix of zeros
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  
  // Generate a random permutation of the row indices
  const indices = Array.from({ length: size }, (_, i) => i);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  
  // Set the element at the shuffled index to 1 for each row
  for (let i = 0; i < size; i++) {
    matrix[indices[i]][i] = 1;
  }
  return matrix;
}

export function randomScalars(size: number): string[] {
  var rands = [];
  for (var i = 0; i < size; i++) {
    const rand = getRandomScalar(babyJub.subOrder).toString();
    rands.push(rand);
  }
  return rands;
}

export function getC1ForRounds(gameState: GameState, rounds: number[], player: string, showdown: boolean): { c1s: Point[], rounds: number[]} {
  var c1s = [];
  var roundsToUse = [];
  var j = 0;
  for (var i = 0; i < gameState.rounds.length; i ++) {
    const round = gameState.rounds[i];
    for (const playerIdx of round) {
      if (rounds.includes(i)) {
        const card = gameState.deck[j];
        if (!card.fields.submitted_decrypt.includes(player)) {
          const cardPlayer = gameState.players[playerIdx];
          if ( playerIdx == PUBLIC_IDX || ((cardPlayer == player) == showdown)) {
            if (!roundsToUse.includes(i)) {
              roundsToUse.push(i);
            };
            c1s.push(decompressPoint(BigInt(card.fields.cipher_text.fields.c1.fields.x), card.fields.cipher_text.fields.c1.fields.flag));
          }
        }
      }
      j++;
    }
  }
  return {
    c1s: c1s,
    rounds: roundsToUse,
  }
}

export async function proveEncryptShuffle(zeroEncrypts: CipherText[], inputs: CipherText[], perm: Permutation, wasmPath: string, zkey: any): Promise<[any, any]> {
  var useZkey;
  if (zkey == undefined) {
    // @ts-ignore
    const zeroEncryptZkey = (window.zeroEncryptZkey === undefined) ? await window.readExisting("/encrypt_shuffle_0001.zkey", 1<<25, 1<<23) : window.zeroEncryptZkey;
    // @ts-ignore
    window.zeroEncryptZkey = zeroEncryptZkey;
    useZkey = zeroEncryptZkey.o;
  } else {
    console.dir(zkey);
    useZkey = zkey;
  }

  const {proof, publicSignals} = await snarkjs.groth16.fullProve({
    in_c1x: inputs.map((ct) => {return BigInt(ct.c1.x)}),
    in_c1y: inputs.map((ct) => {return BigInt(ct.c1.y)}),
    in_c2x: inputs.map((ct) => {return BigInt(ct.c2.x)}),
    in_c2y: inputs.map((ct) => {return BigInt(ct.c2.y)}),
    M: perm.map((row) => {return row.map((x) => {return BigInt(x)})}),
    zeros_c1x: zeroEncrypts.map((ct) => {return BigInt(ct.c1.x)}),
    zeros_c1y: zeroEncrypts.map((ct) => {return BigInt(ct.c1.y)}),
    zeros_c2x: zeroEncrypts.map((ct) => {return BigInt(ct.c2.x)}),
    zeros_c2y: zeroEncrypts.map((ct) => {return BigInt(ct.c2.y)}),
    }, wasmPath, useZkey);
  // @ts-ignore
  const curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
  let proofBytes = proofToBytes(unstringifyBigInts(proof), curve);
  let publicSignalsBytes = BigIntsToBytes(unstringifyBigInts(publicSignals));
  return [proof, publicSignals];
}

export function encryptShuffleLocal(zeroEncrypts: CipherText[], inputs: CipherText[], perm: Permutation): CipherText[] {
  var cipherTexts = [];
  for (var i = 0; i < perm.length; i++) {
    var row = perm[i];
    for (var j = 0; j < row.length; j++) {
      if (row[j] == 1) {
        var outc1 = babyJub.addPoint([BigInt(inputs[j].c1.x), BigInt(inputs[j].c1.y)], [BigInt(zeroEncrypts[j].c1.x), BigInt(zeroEncrypts[j].c1.y)]);
        var outc2 = babyJub.addPoint([BigInt(inputs[j].c2.x), BigInt(inputs[j].c2.y)], [BigInt(zeroEncrypts[j].c2.x), BigInt(zeroEncrypts[j].c2.y)]);
        cipherTexts.push({
          c1: {
            x: outc1[0].toString(),
            y: outc1[1].toString(),
          },
          c2: {
            x: outc2[0].toString(),
            y: outc2[1].toString(),
          }
        });
        break;
      }
    }
  }
  return cipherTexts;
}

export async function encryptShuffle(packageId: string, txb: TransactionBlock, gameId: string, handIdx: number, deckId: string, to: string, 
  rands: string[], pubKeyX: string, pubKeyY: string, inputs: CipherText[], perm: Permutation, plain: boolean,
  zeroEncryptWasmPath: string, encryptShuffleWasmPath: string,
   zeroEncryptZkey: any, zeroEncrypts: CipherText[], encryptShuffleZkey: any, proofZeroEncrypt: any): Promise<void> {
  const [zeroProof, zeroPublicSignals] = await proveZeroEncrypt(rands, pubKeyX, pubKeyY, zeroEncryptWasmPath, zeroEncryptZkey, proofZeroEncrypt);
  const shuffledDeck = encryptShuffleLocal(zeroEncrypts, inputs, perm);

  const serializedDeck = serializeCompressedDeck(compressCipherTexts(shuffledDeck));
  const [proof, publicSignals] = await proveEncryptShuffle(zeroEncrypts, inputs, perm, encryptShuffleWasmPath, encryptShuffleZkey);

  const bcs = new BCS(getSuiMoveConfig());
  // @ts-ignore
  const curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
  let proofBytes = proofToBytes(unstringifyBigInts(proof), curve);
  let publicSignalsBytes = BigIntsToBytes(unstringifyBigInts(publicSignals));

  const serInputBytes = bcs.ser("vector<u8>", publicSignalsBytes).toBytes();
  const serProofBytes = bcs.ser("vector<u8>", proofBytes).toBytes();
  const serDeckBytes = bcs.ser("vector<u8>", serializedDeck, {maxSize: 30000}).toBytes();
  const serZeroProofBytes = bcs.ser("vector<u8>", proofToBytes(unstringifyBigInts(zeroProof), curve)).toBytes();
  const serZeroPublicSignalsBytes = bcs.ser("vector<u8>", BigIntsToBytes(unstringifyBigInts(zeroPublicSignals))).toBytes();

  if (plain) {
    txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::shuffle_plain`, arguments: [txb.pure(to), txb.pure(gameId),
      txb.pure(handIdx),
      txb.pure(serDeckBytes, "vector<u8>"),
      txb.pure(serZeroPublicSignalsBytes, "vector<u8>"), txb.pure(serZeroProofBytes, "vector<u8>"),
      txb.pure(serInputBytes, "vector<u8>"), txb.pure(serProofBytes, "vector<u8>")] });
  } else {
    txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::shuffle`, arguments: [txb.pure(to), txb.pure(deckId),
      txb.pure(serDeckBytes, "vector<u8>"),
      txb.pure(serZeroPublicSignalsBytes, "vector<u8>"), txb.pure(serZeroProofBytes, "vector<u8>"),
      txb.pure(serInputBytes, "vector<u8>"), txb.pure(serProofBytes, "vector<u8>")] });
  }
}

export async function completeShuffle(packageId: string, txb: TransactionBlock, gameId: string, deckId: string, inputs: CipherText[]): Promise<void> {
  const serializedDeck = serializeUncompressedDeck(inputs);
  const bcs = new BCS(getSuiMoveConfig());
  const serDeckBytes = bcs.ser("vector<u8>", serializedDeck, {maxSize: 30000}).toBytes();
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::complete_shuffle2`, arguments: [txb.pure(gameId),
    txb.pure(deckId),
    txb.pure(serDeckBytes, "vector<u8>"),
  ] });
}

export async function proveDecrypt(c1x: string, c1y: string, priv: string, wasmPath: string, zkey: any): Promise<[any, any]> {
  const inputs = {
    c1_x: BigInt(c1x),
    c1_y: BigInt(c1y),
    privKey: BigInt(priv)
  }

  const {proof, publicSignals} = await snarkjs.groth16.fullProve(
    inputs,
    wasmPath, zkey);
  // @ts-ignore
  const curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
  return [proof, publicSignals];
}

export async function decrypt(packageId: string, txb: TransactionBlock, admin: string, gameId: string, handIdx: number,
  roundIdx: number, final: boolean, c1s: Point[], priv: string, c1ToProofInput: any,  wasmPath: string, zkey: any): Promise<void> {
  var allInputBytes = [];
  var allProofBytes = [];
  for (const c1 of c1s) {
    const c1Key = c1.x + "_" + c1.y;
    var proof;
    var inputs;
    if (c1ToProofInput[c1Key] === undefined) {
      [proof, inputs] = await proveDecrypt(c1.x, c1.y, priv, wasmPath, zkey);
    } else {
      proof = c1ToProofInput[c1Key].proof;
      inputs = c1ToProofInput[c1Key].inputs;
    }
    // @ts-ignore
    const curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
    let proofBytes = proofToBytes(unstringifyBigInts(proof), curve);
    let inputBytes = BigIntsToBytes(unstringifyBigInts(inputs));
    allInputBytes.push(inputBytes);
    allProofBytes.push(proofBytes);
  }
  allInputBytes.reverse();
  allProofBytes.reverse();
  const bcs = new BCS(getSuiMoveConfig());
  const serInputBytes = bcs.ser("vector<u8>", bcs.ser("vector<vector<u8>>", allInputBytes, {maxSize: 500000}).toBytes(), {maxSize: 500000}).toBytes();
  const serProofBytes = bcs.ser("vector<u8>", bcs.ser("vector<vector<u8>>", allProofBytes, {maxSize: 500000}).toBytes(), {maxSize: 500000}).toBytes();
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::decrypt2`, arguments: [txb.pure(admin), txb.pure(gameId), txb.pure(handIdx), txb.pure(roundIdx), 
     txb.pure(final), txb.pure(serInputBytes, "vector<u8>"), txb.pure(serProofBytes, "vector<u8>")] });
}

export async function decryptMany(packageId: string, txb: TransactionBlock, admin: string, gameId: string, handIdx: number,
  rounds: number[], c1s: Point[], priv: string, c1ToProofInput: any, wasmPath: string, zkey: any) {
  var allInputBytes = [];
  var allProofBytes = [];
  for (const c1 of c1s) {
    const c1Key = c1.x + "_" + c1.y;
    var proof;
    var inputs;
    if (c1ToProofInput[c1Key] === undefined) {
      [proof, inputs] = await proveDecrypt(c1.x, c1.y, priv, wasmPath, zkey);
    } else {
      proof = c1ToProofInput[c1Key].proof;
      inputs = c1ToProofInput[c1Key].inputs;
    }
    // @ts-ignore
    const curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
    let proofBytes = proofToBytes(unstringifyBigInts(proof), curve);
    let inputBytes = BigIntsToBytes(unstringifyBigInts(inputs));
    allInputBytes.push(inputBytes);
    allProofBytes.push(proofBytes);
  }
  allInputBytes.reverse();
  allProofBytes.reverse();
  const bcs = new BCS(getSuiMoveConfig());
  const serInputBytes = bcs.ser("vector<u8>", bcs.ser("vector<vector<u8>>", allInputBytes, {maxSize: 500000}).toBytes(), {maxSize: 500000}).toBytes();
  const serProofBytes = bcs.ser("vector<u8>", bcs.ser("vector<vector<u8>>", allProofBytes, {maxSize: 500000}).toBytes(), {maxSize: 500000}).toBytes();

  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::decrypt_many`, arguments: [txb.pure(admin), txb.pure(gameId), txb.pure(handIdx), txb.pure(rounds, "vector<u8>"), 
    txb.pure(serInputBytes, "vector<u8>"), txb.pure(serProofBytes, "vector<u8>")] });
}

export async function addMultipleDecrypt(packageId: string, txb: TransactionBlock, gameId: string, decryptIds: string[]): Promise<void> {
  const ids = decryptIds.map((id) => {return txb.object(id)});
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::add_many_decrypt2`, arguments: [txb.pure(gameId), txb.makeMoveVec({ objects: ids })] });}


export async function addMultipleDecryptMany(packageId: string, txb: TransactionBlock, gameId: string, decryptIds: string[]): Promise<void> {
  const ids = decryptIds.map((id) => {return txb.object(id)});
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::add_many_decrypt_many`, arguments: [txb.pure(gameId), txb.makeMoveVec({ objects: ids })] });
}

export async function proveReveal(c2x: string, c2y: string, decryptsX: string[], decryptsY: string[], wasmPath: string, zkey: any): Promise<[any, any]> {
  var localSubX = BigInt(c2x);
  var localSubY = BigInt(c2y);
  for (const [i, x] of decryptsX.entries()) {
    const decY = BigInt(decryptsY[i]);
    const decX = babyJub.F.neg(BigInt(x));
   [localSubX, localSubY] = babyJub.addPoint([localSubX, localSubY], [decX, decY]);
  }
  const outPoint = {
    x: localSubX.toString(),
    y: localSubY.toString(),
  }
  const deck = getPlainDeck(52);

  const cardIdx = findPointInDeck(deck, outPoint);
  if (cardIdx === null) {
    throw new Error('card not found in deck');
  }
  // add 1 to account for 0-indexing
  // the input to the zk proof is the solution to the equation X * G = C2
  // which should range from 1 to 52
  const card = cardIdx + 1;
  var xInputs = decryptsX.map((x) => {return BigInt(x)});
  while (xInputs.length < REVEAL_LENGTH) {
    xInputs.push(BigInt(0));
  }
  var yInputs = decryptsY.map((y) => {return BigInt(y)});
  while (yInputs.length < REVEAL_LENGTH) {
    yInputs.push(BigInt(1));
  }
  const inputs = {
    card: BigInt(card),
    c2x: BigInt(c2x),
    c2y: BigInt(c2y),
    decryptx: xInputs,
    decrypty: yInputs,
  }
  const {proof, publicSignals} = await snarkjs.groth16.fullProve(
    inputs,
    wasmPath, zkey);
  // @ts-ignore
  const curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
  return [proof, publicSignals];

}

export async function reveal(packageId: string, txb: TransactionBlock, gameId: string, cardIdx: number, decrypts: Point[], c2: Point, wasmPath: string, zkey: any): Promise<void> {
  const [proof, inputs] = await proveReveal(c2.x, c2.y, decrypts.map((x) => {return x.x}), decrypts.map((x) => {return x.y}), wasmPath, zkey);
  const bcs = new BCS(getSuiMoveConfig());
  // @ts-ignore
  const curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
  const serProofBytes = bcs.ser("vector<u8>", proofToBytes(unstringifyBigInts(proof), curve)).toBytes();
  const serInputBytes = bcs.ser("vector<u8>", BigIntsToBytes(unstringifyBigInts(inputs))).toBytes();
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::reveal2`, arguments: [txb.pure(gameId), txb.pure(cardIdx), txb.pure(serInputBytes, "vector<u8>"),
    txb.pure(serProofBytes, "vector<u8>")] });
}

export async function revealMany(packageId: string, txb: TransactionBlock, gameId: string, cardIndices: number[], decrypts: Point[][], c2: Point[], wasmPath: string, zkey: any): Promise<void> {
  const bcs = new BCS(getSuiMoveConfig());
  // @ts-ignore
  const curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
  var allInputBytes = [];
  var allProofBytes = [];
  // let indices = Uint8Array.from(cardIndices);

  const proveRealPromises = [];
  for (const [i, cardIdx] of cardIndices.entries()) {
    proveRealPromises.push(proveReveal(c2[i].x, c2[i].y, decrypts[i].map((x) => {return x.x}), decrypts[i].map((x) => {return x.y}), wasmPath, zkey));
  }
  const proofs = await Promise.all(proveRealPromises);
  for (const [i, proof] of proofs.entries()) {
    let proofBytes = proofToBytes(unstringifyBigInts(proof[0]), curve);
    let inputBytes = BigIntsToBytes(unstringifyBigInts(proof[1]));
    allInputBytes.push(inputBytes);
    allProofBytes.push(proofBytes);
  }

  const serInputBytes = bcs.ser("vector<u8>", bcs.ser("vector<vector<u8>>", allInputBytes, {maxSize: 500000}).toBytes(), {maxSize: 500000}).toBytes();
  const serProofBytes = bcs.ser("vector<u8>", bcs.ser("vector<vector<u8>>", allProofBytes, {maxSize: 500000}).toBytes(), {maxSize: 500000}).toBytes();
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::reveal_many`, arguments: [txb.pure(gameId), txb.pure(cardIndices, "vector<u8>"), txb.pure(serInputBytes, "vector<u8>"),
    txb.pure(serProofBytes, "vector<u8>")] });
  
}

export async function getAllGames(packageId: string,  suiClient: SuiClient, admin: string): Promise<GameState[]> {
  var adminState = await getAdminState(packageId, suiClient, admin);
  const games = findAllObjects(packageId, GameObject.GameV2, {}, adminState);
  return games.map((game: GameState) => { 
    game.fields.gameId = game.fields.id.id;
    return game.fields});
}

export async function getGame(suiClient: SuiClient, gameId: string): Promise<GameState> {
  const game = await suiClient.getObject({ id: gameId, options: {showContent: true} });
  var content = game.data!.content;
  if (content?.dataType === 'moveObject' && !Array.isArray(content.fields)) {
    var result: GameState = content.fields;
    result.gameId = result.id.id;
    return result;
  }
  throw new Error(`Invalid game object: ${JSON.stringify(game)}`);
}

export async function getAdminState(packageId: string, suiClient: SuiClient, addr: string): Promise<MoveObject[]> {
  const objects = await suiClient.getOwnedObjects({ owner: addr,
     options: {showContent: true},
     filter: {
     "MatchAny": [
      {"StructType": formatGameObject(packageId, GameObject.JoinGame)},
      {"StructType": formatGameObject(packageId, GameObject.LeaveGame)},
      {"StructType": formatGameObject(packageId, GameObject.StartGame)},
      {"StructType": formatGameObject(packageId, GameObject.EncFragment)},
      {"StructType": formatGameObject(packageId, GameObject.GameV2)},
      {"StructType": formatGameObject(packageId, GameObject.ShuffledDeck)},
      {"StructType": formatGameObject(packageId, GameObject.PartialDecryptV2)},
      {"StructType": formatGameObject(packageId, GameObject.PartialDecryptMany)},
      {"StructType": formatGameObject(packageId, GameObject.Bet)},
      {"StructType": formatGameObject(packageId, GameObject.Betless)},
    ]
    }
  });
  let result = objects.data.filter(
    (obj) => obj.data!.content!.dataType === 'moveObject'
  ).map((obj) => obj.data!.content!);
  let filtered = [];
  for (let i = 0; i < result.length; i++) {
    let obj = result[i];
    if (obj.dataType == 'moveObject') {
      filtered.push(obj);
    }
  };
  return filtered;
}

export async function getPlayerStates(packageID: string, suiClient: SuiClient, players: string[]): Promise<Map<string, MoveObject[]>> {
  var results = new Map<string, MoveObject[]>();
  await Promise.all(players.map(async (player) => {
    const state = await getAdminState(packageID, suiClient, player);
    results.set(player, state);
  }));
  return results;
}

function objectMatches(object: MoveObject, attributes: any): boolean {
  for (const [key, value] of Object.entries(attributes)) {
    var objField = object.fields[key];
    if (typeof value === 'string' || typeof value === 'number') {
      if (objField !== value) {
        return false;
      }
    } else {
      if (!objectMatches(objField, value)) {
        return false;
      }
    }
  }
  return true;
}

export function findAllObjects(packageId: string, type: GameObject, attributes: any, objects: MoveObject[]): MoveObject[] {
  var results = [];
  for (const obj of objects) {
    if (isGameObject(obj.type, packageId, type)  && objectMatches(obj, attributes)) {
      results.push(obj);
    }
  }
  return results;
}

export function findObject(packageId: string, type: GameObject, attributes: any, objects: MoveObject[]): MoveObject {
  for (const obj of objects) {
    if (isGameObject(obj.type, packageId, type) && objectMatches(obj, attributes)) {
      return obj;
    }
  }
  return null;
}


function filterObjects(packageId: string, objects: MoveObject[], type: GameObject): MoveObject[] {
  return objects.filter(
    (obj) => isGameObject(obj.type, packageId, type)
  );
}

// TODO: find sb index
function getBlindPlayers(parsedGameState: ParsedGameState): [number, number] {
  const buttonIdx = parsedGameState.buttonIdx;
  const sbIdx = (parsedGameState.players.length == 2) ? buttonIdx : (buttonIdx + 1) % parsedGameState.players.length;
  const bbIdx = (parsedGameState.players.length == 2) ? (buttonIdx + 1) % parsedGameState.players.length : (buttonIdx + 2) % parsedGameState.players.length;
  return [sbIdx, bbIdx];
}

export function getLeaveAction(gameState: GameState, player: string, i: number): Action {
  const leaveAction = {
    type: ActionType.LEAVE,
    from: player,
    admin: false,
    payload: {
      gameId: gameState.id.id,
      admin: gameState.admin,
    }
  };
  return leaveAction;
}

export function getAction(packageId: string, gameState: GameState, playerStates: Map<string, MoveObject[]>, adminState: MoveObject[], new_player: string ): Action[] {
  // join
  var actions = [];
  var foundAddPlayer = false;

  const parsedGameState = parseGameState(gameState);
  var leaveGames = filterObjects(packageId, adminState, GameObject.LeaveGame);
  var foundLeave = [];
  // see if we can remove a player

  for (let i = 0; i < leaveGames.length; i++) {
    const obj = leaveGames[i];
    // @ts-ignore
    const player = obj.fields.player;
    // @ts-ignore
    const objGameId = obj.fields.game_id;
    const idx = gameState.players.indexOf(player);

    if (objGameId == gameState.id.id && idx > -1) {
      foundLeave.push(player);
      if (gameState.can_add_player && !foundAddPlayer) {
        foundAddPlayer = true;
        actions.push({
          type: ActionType.REMOVE_PLAYER,
          admin: true,
          payload: {
            gameId: gameState.id.id,
            // @ts-ignore
            objectId: obj.fields.id.id,
            group_x: gameState.group_public_key.fields.x,
            group_y: gameState.group_public_key.fields.y,
            // @ts-ignore
            player_x: gameState.public_keys[idx].fields.x,
            // @ts-ignore
            player_y: gameState.public_keys[idx].fields.y
          }
        });
      }

    }
  }

  for (const [i, player] of gameState.players.entries()) {
    if (!foundLeave.includes(player)) {
      actions.push(getLeaveAction(gameState, player, i));
    }

    const balance = parsedGameState.playerStates[player].balance;
    if (balance < parsedGameState.bigBlind && gameState.can_add_player && !foundAddPlayer) {
      foundAddPlayer = true;
      actions.push({
        type: ActionType.REMOVE_BUST_PLAYER,
        admin: true,
        payload: {
          gameId: gameState.id.id,
          address: player,
          group_x: gameState.group_public_key.fields.x,
          group_y: gameState.group_public_key.fields.y,
          // @ts-ignore
          player_x: gameState.public_keys[i].fields.x,
          // @ts-ignore
          player_y: gameState.public_keys[i].fields.y
        }
      });
    }
  }

  if (true) {
  // if (!gameState.players.includes(new_player)) {
    var publicKeys = filterObjects(packageId, adminState, GameObject.JoinGame);
    var foundJoin = false;
    var playersAdded = [...gameState.players];
    var takenSeats = [...gameState.player_seats];
    
    for (let i = 0; i < publicKeys.length; i++) {
      const obj = publicKeys[i];
      // @ts-ignore
      const player = obj.fields.player;
      // @ts-ignore
      const seat = obj.fields.seat;
      // @ts-ignore
      const objGameId = obj.fields.game_id;
      // @ts-ignore
      const balance = parseInt(obj.fields.balance);
      // can only add one player at a time
      if (objGameId == gameState.id.id
        && !playersAdded.includes(player) && !foundAddPlayer
        && (balance >= parseInt(gameState.big_blind))
        && !takenSeats.includes(seat) && seat < 9) {
        if (player == new_player){
          foundJoin = true;
        }
        if (gameState.can_add_player) {
          playersAdded.push(player);
          foundAddPlayer = true;
          actions.push({
            type: ActionType.ADD_PLAYER,
            admin: true,
            payload: {
              gameId: gameState.id.id,
              // @ts-ignore
              publicKeyId: obj.fields.id.id,
              group_x: gameState.group_public_key.fields.x,
              group_y: gameState.group_public_key.fields.y,
              // @ts-ignore
              new_x: obj.fields.point.fields.x,
              // @ts-ignore
              new_y: obj.fields.point.fields.y,
            }
          });
        }
      }
    }
    if (!foundJoin && !gameState.players.includes(new_player)) {
      actions.push({
        type: ActionType.JOIN,
        admin: false,
        from: new_player,
        payload: {
          admin: gameState.admin,
          gameId: gameState.id.id,
          address: new_player
        },
        inputs: ['balance', 'seat'],
      });
    } 
  }

  // don't start logic unless players are added/removed
  if (gameState.started && !foundAddPlayer && gameState.players.length > 1) {
    if (gameState.deck.length == 0) {
      var players = gameState.players;
      var playersOrdered = players.slice();
      playersOrdered.push(gameState.admin);
      playersOrdered.reverse();
      for (const [i, player] of playersOrdered.entries()) {
        var searchParams;
        const playerState = (i == 0) ? adminState : playerStates.get(player);
        if (i < playersOrdered.length - 1) {
          searchParams = {
            game_id: gameState.id.id,
            hand_idx: gameState.hand_idx,
            // TODO:: make this rigorous by checking that it came from the previous player
            // from: playersOrdered[i + 1],
            public_key: {
              x: gameState.group_public_key.fields.x,
              y: gameState.group_public_key.fields.y,
            }
            
          }
          var foundDeck = findObject(packageId, GameObject.ShuffledDeck, searchParams, playerState);
          if (foundDeck !== null ) {
            if (i == 0 ){
              actions.push({
                type: ActionType.COMPLETE_SHUFFLE,
                admin: true,
                payload: {
                  gameId: gameState.id.id,
                  // @ts-ignore
                  deckId: foundDeck.fields.id.id,
                  inputs: decompressDeck(parseCompressedDeck(foundDeck)),
                },
                key: [gameState.hand_idx]
              })
  
            } else {
              actions.push({
                type: ActionType.SHUFFLE,
                admin: false,
                from: player,
                payload: {
                  to: playersOrdered[i - 1],
                  gameId: gameState.id.id,
                  handIdx: gameState.hand_idx,
                  // @ts-ignore
                  deckId: foundDeck.fields.id.id,
                  pubKeyX: gameState.group_public_key.fields.x,
                  pubKeyY: gameState.group_public_key.fields.y,
                  inputs: decompressDeck(parseCompressedDeck(foundDeck)),
                  plain: false,
                },
                inputs: ['proofZeroEncrypt'],
                key: [playersOrdered[i - 1], gameState.hand_idx, gameState.group_public_key.fields.x]
              });
            }
            break;
          }
        }
        else {
          actions.push({
            type: ActionType.SHUFFLE,
            admin: false,
            from: player,
            payload: {
              to: playersOrdered[i - 1],
              gameId: gameState.id.id,
              handIdx: gameState.hand_idx,
              deckId: '',
              pubKeyX: gameState.group_public_key.fields.x,
              pubKeyY: gameState.group_public_key.fields.y,
              inputs: getPlainDeck(52),
              plain: true,
            },
            inputs: ['proofZeroEncrypt'],
            key: [playersOrdered[i - 1], gameState.hand_idx, gameState.group_public_key.fields.x]
          });
        }
      }
    } else {
      const decryptRound = gameState.decrypt_round;
      const betRound = gameState.bet_round;
      const bettingOver = (betRound == NUM_ROUNDS);
      const isRevealPhase = (decryptRound == NUM_ROUNDS) && bettingOver;
      const useDecryptRound = isRevealPhase ? 0 : decryptRound;
      const numPlayersInHand = gameState.current_hand_players.length;

      const sbSubmitted = gameState.sb_submitted;
      const bbSubmitted = gameState.bb_submitted;
      const [sbIdx, bbIdx] = getBlindPlayers(parsedGameState);
      if (!sbSubmitted) {
        const foundSb = findObject(packageId, GameObject.Bet, {
          game_id: gameState.id.id,
          // @ts-ignore
          player: gameState.players[sbIdx],
          round: 0,
          amount: gameState.small_blind,
        }, adminState);
        if (foundSb === null) {
          actions.push({
            type: ActionType.BLIND_BET,
            admin: false,
            from: gameState.players[sbIdx],
            payload: {
              gameId: gameState.id.id,
              handIdx: gameState.hand_idx,
              admin: gameState.admin,
              amount: gameState.small_blind,
              betRound: 0,
              betType: BetType.BLIND_BET,
            },
            key: [gameState.hand_idx]
          });
        } else {
          actions.push({
            type: ActionType.ADD_BET,
            admin: true,
            payload: {
              gameId: gameState.id.id,
              // @ts-ignore
              objId: foundSb.fields.id.id,
            }
          });
        }
      }
      if (!bbSubmitted) {
        const foundBb = findObject(packageId, GameObject.Bet, {
          game_id: gameState.id.id,
          // @ts-ignore
          player: gameState.players[bbIdx],
          round: 0,
          amount: gameState.big_blind,
        }, adminState);
        if (foundBb === null) {
          actions.push({
            type: ActionType.BLIND_BET,
            admin: false,
            from: gameState.players[bbIdx],
            payload: {
              gameId: gameState.id.id,
              handIdx: gameState.hand_idx,
              admin: gameState.admin,
              amount: gameState.big_blind,
              betRound: 0,
              betType: BetType.BLIND_BET,
            },
            key: [gameState.hand_idx]
          });
        } else {
          actions.push({
            type: ActionType.ADD_BET,
            admin: true,
            payload: {
              gameId: gameState.id.id,
              // @ts-ignore
              objId: foundBb.fields.id.id,
            }
          });
        }
      }
      if (sbSubmitted && bbSubmitted) {
        if (gameState.hand_over) {
          actions.push({
            type: ActionType.RESET_GAME,
            admin: true,
            payload: {
              gameId: gameState.id.id,
            }
          });
        } else {
          if (decryptRound == betRound + 1) {
            const betPlayerIdx = gameState.bet_player;
            const betPlayer = gameState.players[betPlayerIdx];
            
            const available = [
              {betType: BetType.FOLD, betTypeInt: 4, objectType: GameObject.Betless, actionType: ActionType.ADD_BETLESS},
              {betType: BetType.CHECK, betTypeInt: 3, objectType: GameObject.Betless, actionType: ActionType.ADD_BETLESS},
              {betType: BetType.CALL,  betTypeInt: 0,  objectType: GameObject.Bet, actionType: ActionType.ADD_BET},
              {betType: BetType.BET,  betTypeInt: 2, objectType: GameObject.Bet, actionType: ActionType.ADD_BET},
            ];
            var foundObject = false;
            for (const avail of available) {
              const betType = avail.betType;
              const actionType = avail.actionType;
              const objectType = avail.objectType;
              const betTypeInt = avail.betTypeInt;
              if (!parsedGameState.availableActions.includes(betType)) {
                continue;
              }
              const findParams = {
                game_id: gameState.id.id,
                player: betPlayer,
                round: betRound,
              };
              findParams[objectType == GameObject.Bet ? 'bet_type' : 'betless_type'] = betTypeInt;
              const foundBet = findObject(packageId, objectType, findParams, adminState);
              if (foundBet !== null) {
                actions.push({
                  type: actionType,
                  admin: true,
                  payload: {
                    gameId: gameState.id.id,
                    // @ts-ignore
                    objId: foundBet.fields.id.id,
                  }
                });
                foundObject = true;
                // break;
              }
            }
            if (!foundObject) {
              let roundsToDecrypt = [];
              for (var i = 0; i < gameState.rounds.length; i ++) {
                if (i >= decryptRound) {
                  roundsToDecrypt.push(i);
                }
              }
              // used for fold + decrypt
              const { c1s: c1s, rounds: decryptRounds } = getC1ForRounds(gameState, roundsToDecrypt, betPlayer, false);

              const [useC1s, useDecryptRounds] = numPlayersInHand > 2 ? [c1s, decryptRounds] : [[], []];
  
              actions.push({
                type: ActionType.BET,
                admin: false,
                from: betPlayer,
                payload: {
                  gameId: gameState.id.id,
                  handIdx: gameState.hand_idx,
                  admin: gameState.admin,
                  betRound: betRound,
                  decryptRounds: useDecryptRounds,
                  c1s: useC1s,
                  c1ToProofInput: {}
                },
                inputs: ['betType', 'amount'],
                key: [gameState.pot]
              });
            }
          }
          if ((decryptRound == betRound) || bettingOver) {
            const decryptsToAdd = [];
            const decryptManysToAdd = [];
            for (const [idx, player] of gameState.players.entries()) {
              const playerPublicKey = gameState.public_keys[idx];
              const playerIsIn = gameState.current_hand_players.includes(idx);
              if (bettingOver || !playerIsIn) {
                // if (! gameState.current_hand_players.includes(idx)) {
                //   continue;
                // }
                var foundDecrypt = findObject(packageId, GameObject.PartialDecryptMany, {
                  game_id: gameState.id.id,
                  from: player,
                  hand_idx: gameState.hand_idx,
                  public_key: {
                    x: playerPublicKey.fields.x,
                    y: playerPublicKey.fields.y,
                  }
                }, adminState);
                if (foundDecrypt !== null) {
                  decryptManysToAdd.push(foundDecrypt);
                } else {
                  var roundsToDecrypt = [];
                  for (var i = 0; i < gameState.rounds.length; i ++) {
                    if ((i == 0 && playerIsIn) || i >= decryptRound) {
                      roundsToDecrypt.push(i);
                    }
                  }
                  // var j = 0;
                  const { c1s: c1s, rounds: roundsToUse } = getC1ForRounds(gameState, roundsToDecrypt, player, true);
                  if (c1s.length > 0) {
                    actions.push({
                      type: ActionType.DECRYPT_MANY,
                      admin: false,
                      from: player,
                      payload: {
                        gameId: gameState.id.id,
                        handIdx: gameState.hand_idx,
                        admin: gameState.admin,
                        rounds: roundsToUse,
                        c1s: c1s,
                        c1ToProofInput: {},
                      },
                      key: roundsToUse
                    });
                  }
                }
              } else {
                var foundDecrypt = findObject(packageId, GameObject.PartialDecryptV2, {
                  game_id: gameState.id.id,
                  from: player,
                  hand_idx: gameState.hand_idx,
                  round: useDecryptRound,
                  final: isRevealPhase,
                  public_key: {
                    x: playerPublicKey.fields.x,
                    y: playerPublicKey.fields.y,
                  }
                }, adminState);
                if (foundDecrypt !== null) {
                  decryptsToAdd.push(foundDecrypt);
                } else {
                  const { c1s: c1s, rounds: roundsToUse } = getC1ForRounds(gameState, [useDecryptRound], player, false);
                  if (c1s.length > 0) {
                    actions.push({
                      type: ActionType.DECRYPT,
                      admin: false,
                      from: player,
                      payload: {
                        gameId: gameState.id.id,
                        handIdx: gameState.hand_idx,
                        admin: gameState.admin,
                        roundIdx: useDecryptRound,
                        final: isRevealPhase,
                        c1s: c1s,
                        c1ToProofInput: {},
                      },
                      key: [useDecryptRound]
                    });
                  }
                }
              }
            }

            if (decryptsToAdd.length > 0) {
              actions.push({
                type: ActionType.ADD_MULTIPLE_DECRYPT,
                admin: true,
                payload: {
                  gameId: gameState.id.id,
                  decryptIds: decryptsToAdd.map((dec) => dec.fields.id.id),
                }
              });
            }
            if (decryptManysToAdd.length > 0) {
              actions.push({
                type: ActionType.ADD_MULTIPLE_DECRYPT_MANY,
                admin: true,
                payload: {
                  gameId: gameState.id.id,
                  decryptIds: decryptManysToAdd.map((dec) => dec.fields.id.id),
                }
              });
            }
            // do something


          }
          if ((betRound == NUM_ROUNDS) && (decryptRound == NUM_ROUNDS) && !gameState.hand_over) {
            var shouldFindWinner = true;
            var j = 0;
            for (var i = 0; i < gameState.rounds.length; i ++) {
              const round = gameState.rounds[i];
              for (const playerIdx of round) {
                const playerIsIn = (playerIdx == PUBLIC_IDX) || gameState.current_hand_players.includes(playerIdx);
                const card = gameState.deck[j];
                if (!card.fields.revealed && playerIsIn) {
                  shouldFindWinner = false;
                  break;
                }
                j++;
              }
            }
            if (shouldFindWinner) {
              actions.push({
                type: ActionType.FIND_WINNER,
                admin: true,
                payload: {
                  gameId: gameState.id.id,
                }
              });
            }
          }
        }
      }
      let cardIndices = [];
      let allDecrypts = [];
      let allC2 = [];
      for (const [i, card] of gameState.deck.entries()) {
        if (card.fields.revealable && !card.fields.revealed)  {
          const decompressedC2  = decompressPoint(BigInt(card.fields.cipher_text.fields.c2.fields.x), card.fields.cipher_text.fields.c2.fields.flag);
          cardIndices.push(i);
          allDecrypts.push(card.fields.decrypts.map((dec) => { return {
            x: dec.fields.x,
            y: dec.fields.y
          }}));
          allC2.push(decompressedC2);
        }
      }
      if (cardIndices.length > 0) {
        actions.push ({
          type: ActionType.REVEAL_MANY,
          admin: true,
          payload: {
            gameId: gameState.id.id,
            cardIndices: cardIndices,
            decrypts: allDecrypts,
            c2: allC2,
          }
        });
      }
    }
  }
  return actions;
}

export type WasmPaths = {
  [key: string]: string
}

export function actionsAreSame(action1: Action, action2: Action): boolean {
  // compare every attribute except payload
  if (action1.type !== action2.type) {
    return false;
  }
  if (action1.from !== action2.from) {
    return false;
  }
  if (action1.admin !== action2.admin) {
    return false;
  }
  if (JSON.stringify(action1.inputs) !== JSON.stringify(action2.inputs)) {
    return false;
  }
  if (JSON.stringify(action1.key) !== JSON.stringify(action2.key)) {
    return false;
  }
  return true;
}

export async function handleAction(packageId: string, txb: TransactionBlock, action: Action, privateKey: string, wasms: WasmPaths, zkeys?: any): Promise<boolean> {
  const payload = action.payload;
  if (action.inputs) {
    for (const input of action.inputs) {
      if (payload[input] === undefined) {
        throw new Error(`Missing input: ${input}`);
      }
    }
  }
  switch (action.type) {
    case ActionType.JOIN:
      await join(packageId, txb, payload.gameId, payload.admin, privateKey, payload.balance, payload.seat, wasms.pubKey, zkeys.pubKeyZkey);
      break;
    case ActionType.LEAVE:
      await leave(packageId, txb, payload.gameId, payload.admin);
      break;
    case ActionType.ADD_PLAYER:
      await addPlayer(packageId, txb, payload.gameId, payload.publicKeyId, payload.group_x, payload.group_y, payload.new_x, payload.new_y, wasms.add, zkeys.addZkey);
      break;
    case ActionType.REMOVE_PLAYER:
      await removePlayer(packageId, txb, payload.gameId, payload.objectId, payload.group_x, payload.group_y, payload.player_x, payload.player_y, wasms.add, zkeys.addZkey);
      break;
    case ActionType.REMOVE_BUST_PLAYER:
      await removeBustPlayer(packageId, txb, payload.gameId, payload.address, payload.group_x, payload.group_y, payload.player_x, payload.player_y, wasms.add, zkeys.addZkey);
      break;
    case ActionType.START:
      await startGame(packageId, txb, payload.gameId, payload.admin);
      break;
    case ActionType.INIT:
      await initGame(packageId, txb, payload.gameId, payload.startId);
      break;
    case ActionType.SHUFFLE:
      const perm = randomPermutation(52);
      const rands = (payload.proofZeroEncrypt === null) ? randomScalars(52) : payload.proofZeroEncrypt.rands;
      const zeroEncrypts = (payload.proofZeroEncrypt === null) ? zeroEncryptLocal(rands, payload.pubKeyX, payload.pubKeyY) : payload.proofZeroEncrypt.zeroEncrypts;
      const zeroEncryptZkey = zkeys.zeroEncryptZkey;
      const encryptShuffleZkey = zkeys.encryptShuffleZkey;
      const zeroEncryptWasmpath = wasms.zeroEncrypt;
      const encryptShuffleWasmpath = wasms.encryptShuffle;

      await encryptShuffle(packageId, txb, payload.gameId, payload.handIdx, payload.deckId, payload.to, rands, payload.pubKeyX,
        payload.pubKeyY, payload.inputs, perm, payload.plain, zeroEncryptWasmpath, encryptShuffleWasmpath, zeroEncryptZkey, zeroEncrypts, encryptShuffleZkey, payload.proofZeroEncrypt);
      break;
    case ActionType.COMPLETE_SHUFFLE:
      await completeShuffle(packageId, txb, payload.gameId, payload.deckId, payload.inputs);
      break;
    case ActionType.DECRYPT:
      var c1ToProofInput = payload.c1ToProofInput;
      await decrypt(packageId, txb, payload.admin, payload.gameId, payload.handIdx, payload.roundIdx, payload.final, payload.c1s, privateKey, c1ToProofInput, wasms.decrypt, zkeys.decryptZkey);
      break;
    case ActionType.ADD_MULTIPLE_DECRYPT:
      await addMultipleDecrypt(packageId, txb, payload.gameId, payload.decryptIds);
      break;
    case ActionType.DECRYPT_MANY:
      var c1ToProofInput = payload.c1ToProofInput;
      await decryptMany(packageId, txb, payload.admin, payload.gameId, payload.handIdx, payload.rounds, payload.c1s, privateKey, c1ToProofInput, wasms.decrypt, zkeys.decryptZkey);
      break;
    case ActionType.ADD_MULTIPLE_DECRYPT_MANY:
      await addMultipleDecryptMany(packageId, txb, payload.gameId, payload.decryptIds);
      break;
    case ActionType.REVEAL:
      await reveal(packageId, txb, payload.gameId, payload.cardIdx, payload.decrypts, payload.c2, wasms.reveal, zkeys.revealZkey);
      break;
    case ActionType.REVEAL_MANY:
      await revealMany(packageId, txb, payload.gameId, payload.cardIndices, payload.decrypts, payload.c2, wasms.reveal, zkeys.revealZkey);
      break;
    case ActionType.BLIND_BET:
      await bet(packageId, txb, payload.gameId, payload.handIdx, payload.admin, payload.betRound, payload.amount, payload.betType);
      break;
    case ActionType.ADD_BET:
      await addBet(packageId, txb, payload.gameId, payload.objId);
      break;
    case ActionType.ADD_BETLESS:
      await addBetless(packageId, txb, payload.gameId, payload.objId);
      break;
    case ActionType.BET:
      if (payload.betType == BetType.FOLD) {
        var c1ToProofInput = payload.c1ToProofInput;
        // await fold(txb, payload.gameId, payload.handIdx, payload.admin, payload.betRound);
        await foldAndDecryptMany(packageId, txb, payload.gameId, payload.handIdx, payload.admin, payload.betRound, payload.decryptRounds, payload.c1s, privateKey, c1ToProofInput, wasms.decrypt, zkeys.decryptZkey);
      } else if (payload.betType == BetType.CHECK) {
        await check(packageId, txb, payload.gameId, payload.handIdx, payload.admin, payload.betRound);
      } else if (payload.betType == BetType.CALL) {
        await bet(packageId, txb, payload.gameId, payload.handIdx, payload.admin, payload.betRound, payload.amount, payload.betType);
      } else if (payload.betType == BetType.BET) {
        await bet(packageId, txb, payload.gameId, payload.handIdx, payload.admin, payload.betRound, payload.amount, payload.betType);
      };
      break;
    case ActionType.FIND_WINNER:
      await findWinners(packageId, txb, payload.gameId);
      break;
    case ActionType.RESET_GAME:
      await resetGame(packageId, txb, payload.gameId);
      break;
    default:
      return false;
  }
  return true;
}

export async function resetGame(packageId: string, txb: TransactionBlock, gameId: string): Promise<TransactionBlock> {
  await sleep(2000);
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::reset_game`, arguments: [txb.pure(gameId)]});
  return txb;
}

export async function findWinners(packageId: string, txb: TransactionBlock, gameId: string): Promise<TransactionBlock> {
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::find_winners`, arguments: [txb.pure(gameId)]});
  return txb;
}

export async function fold(packageId: string, txb: TransactionBlock, gameId: string, handIdx: number, admin: string, round: number): Promise<TransactionBlock> {
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::fold`, arguments: [txb.pure(admin), txb.pure(gameId), txb.pure(handIdx), txb.pure(round)]});
  return txb;
}

export async function foldAndDecryptMany(packageId: string, txb: TransactionBlock, gameId: string, handIdx: number, admin: string,
  betRound: number, rounds: number[], c1s: Point[], priv: string, c1ToProofInput: any, wasmPath: string, zkey: string): Promise<TransactionBlock> {
  if (c1s.length == 0) {
    return fold(packageId, txb, gameId, handIdx, admin, betRound);
  }
  var allInputBytes = [];
  var allProofBytes = [];
  for (const c1 of c1s) {
    var proof;
    var inputs;
    const c1Key = c1.x + "_" + c1.y;  
    if (c1ToProofInput[c1Key] === undefined) {
      [proof, inputs] = await proveDecrypt(c1.x, c1.y, priv, wasmPath, zkey);
    } else {
      proof = c1ToProofInput[c1Key].proof;
      inputs = c1ToProofInput[c1Key].inputs;
    }
    // @ts-ignore
    const curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
    let proofBytes = proofToBytes(unstringifyBigInts(proof), curve);
    let inputBytes = BigIntsToBytes(unstringifyBigInts(inputs));
    allInputBytes.push(inputBytes);
    allProofBytes.push(proofBytes);
  }
  allInputBytes.reverse();
  allProofBytes.reverse();
  const bcs = new BCS(getSuiMoveConfig());
  const serInputBytes = bcs.ser("vector<u8>", bcs.ser("vector<vector<u8>>", allInputBytes, {maxSize: 500000}).toBytes(), {maxSize: 500000}).toBytes();
  const serProofBytes = bcs.ser("vector<u8>", bcs.ser("vector<vector<u8>>", allProofBytes, {maxSize: 500000}).toBytes(), {maxSize: 500000}).toBytes();
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::fold_and_decrypt_many`, arguments: [txb.pure(admin), txb.pure(gameId), txb.pure(handIdx), txb.pure(betRound),
    txb.pure(rounds, "vector<u8>"), txb.pure(serInputBytes, "vector<u8>"), txb.pure(serProofBytes, "vector<u8>")
  ]});
  return txb;
}

export async function check(packageId: string, txb: TransactionBlock, gameId: string, handIdx: number, admin: string, round: number): Promise<TransactionBlock> {
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::check`, arguments: [txb.pure(admin), txb.pure(gameId), txb.pure(handIdx), txb.pure(round)]});
  return txb;
}

export async function bet(packageId: string, txb: TransactionBlock, gameId: string, handIdx: number, admin: string, round: number, amount: number, betType: BetType): Promise<TransactionBlock> {
  const [coin] = txb.splitCoins(txb.gas, [txb.pure(amount)]);
  // call = 0, bet/raise = 2, raise = 5
  const betTypeInt = (betType == BetType.CALL) ? 0 : (betType == BetType.BET) ? 2 : 5;
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::bet`, arguments: [txb.pure(admin), txb.pure(gameId), txb.pure(handIdx), coin, txb.pure(round), txb.pure(betTypeInt)]});
  return txb;
}

export async function addBet(packageId: string, txb: TransactionBlock, gameId: string, betId: string): Promise<TransactionBlock> {
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::add_bet`, arguments: [txb.pure(gameId), txb.pure(betId)]});
  return txb;
}

export async function returnBet(packageId: string, txb: TransactionBlock, betId: string): Promise<TransactionBlock> {
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::return_bet`, arguments: [txb.pure(betId)]});
  return txb;
}

export async function addBetless(packageId: string, txb: TransactionBlock, gameId: string, betlessId: string): Promise<TransactionBlock> {
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::add_betless`, arguments: [txb.pure(gameId), txb.pure(betlessId)]});
  return txb;
}

export async function startNewGame(packageId: string,  txb: TransactionBlock, admin: string, small_blind: string, big_blind: string): Promise<TransactionBlock> {
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::create_game2`, arguments: [txb.pure(admin), txb.pure(BigInt(small_blind)), txb.pure(BigInt(big_blind))] });
  return txb;
}


export async function addPlayer(packageId: string, txb: TransactionBlock, gameId: string, objectId: string,
      group_x: string, group_y: string, new_x: string, new_y: string,
      addWasmPath: string, addZkey: any
      ): Promise<void> {
  const {proof, publicSignals} = await snarkjs.groth16.fullProve({
      x: [BigInt(group_x), BigInt(new_x), BigInt("0"), BigInt("0"), BigInt("0")],
      y: [BigInt(group_y), BigInt(new_y), BigInt("1"), BigInt("1"), BigInt("1")]
      }, addWasmPath, addZkey);
  // @ts-ignore
  var curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
  let proofBytes = proofToBytes(unstringifyBigInts(proof), curve);
  let inputBytes = BigIntsToBytes(unstringifyBigInts(publicSignals));
  const bcs = new BCS(getSuiMoveConfig());
  const serInputBytes = bcs.ser("vector<u8>", inputBytes).toBytes();
  const serProofBytes = bcs.ser("vector<u8>", proofBytes).toBytes();
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::add_player2`, arguments: [txb.pure(gameId), txb.pure(objectId), txb.pure(serInputBytes, "vector<u8>"), txb.pure(serProofBytes, "vector<u8>")] });
}

export async function removePlayer(packageId: string, txb: TransactionBlock, gameId: string, objectId: string,
  group_x: string, group_y: string, player_x: string, player_y: string, addWasmPath: string, addZkey: any): Promise<void> {
  const point = {
    x: player_x,
    y: player_y,
  }
  const negPoint = invertPoint(point);
  const {proof, publicSignals} = await snarkjs.groth16.fullProve({
      x: [BigInt(group_x), BigInt(negPoint.x), BigInt("0"), BigInt("0"), BigInt("0")],
      y: [BigInt(group_y), BigInt(negPoint.y), BigInt("1"), BigInt("1"), BigInt("1")]
      }, addWasmPath, addZkey);
  // @ts-ignore
  var curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
  babyJub.mulPointEscalar
  let proofBytes = proofToBytes(unstringifyBigInts(proof), curve);
  let inputBytes = BigIntsToBytes(unstringifyBigInts(publicSignals));
  const bcs = new BCS(getSuiMoveConfig());
  const serInputBytes = bcs.ser("vector<u8>", inputBytes).toBytes();
  const serProofBytes = bcs.ser("vector<u8>", proofBytes).toBytes();
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::remove_player`, arguments: [txb.pure(gameId), txb.pure(objectId), txb.pure(serInputBytes, "vector<u8>"), txb.pure(serProofBytes, "vector<u8>")] });
}


export async function removeBustPlayer(packageId: string, txb: TransactionBlock, gameId: string, player: string, 
          group_x: string, group_y: string, player_x: string, player_y: string, addWasmPath: string, addZkey: any): Promise<void> {
  const point = {
    x: player_x,
    y: player_y,
  }
  const negPoint = invertPoint(point);
  const {proof, publicSignals} = await snarkjs.groth16.fullProve({
      x: [BigInt(group_x), BigInt(negPoint.x), BigInt("0"), BigInt("0"), BigInt("0")],
      y: [BigInt(group_y), BigInt(negPoint.y), BigInt("1"), BigInt("1"), BigInt("1")]
      }, addWasmPath, addZkey);
  // @ts-ignore
  var curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;
  let proofBytes = proofToBytes(unstringifyBigInts(proof), curve);
  let inputBytes = BigIntsToBytes(unstringifyBigInts(publicSignals));
  const bcs = new BCS(getSuiMoveConfig());
  const serInputBytes = bcs.ser("vector<u8>", inputBytes).toBytes();
  const serProofBytes = bcs.ser("vector<u8>", proofBytes).toBytes();
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::remove_bust_player`, arguments: [txb.pure(gameId), txb.pure(player), txb.pure(serInputBytes, "vector<u8>"), txb.pure(serProofBytes, "vector<u8>")] });
}

export async function initGame(packageId: string, txb: TransactionBlock, gameId: string, startId: string): Promise<void> {
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::add_start_game2`, arguments: [txb.pure(gameId), txb.pure(startId)] });
}

export async function startGame(packageId: string, txb: TransactionBlock, gameId: string, admin: string): Promise<void> {
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::start_game2`, arguments: [txb.pure(admin), txb.pure(gameId)] });
}

export function generatePrivateKey(): string {
  const rand = getRandomScalar(babyJub.subOrder).toString();
  return rand;
}

export async function join(packageId: string, txb: TransactionBlock, gameId: string, admin: string, privateKey: string, balance: string, seat: number, pubKeyWasmPath: string, pubKeyZkey: any): Promise<void>{
  const randScalar = BigInt(privateKey);
  const {proof, publicSignals} = await snarkjs.groth16.fullProve({ in: randScalar }, pubKeyWasmPath, pubKeyZkey);
  // @ts-ignore
  var curve = (typeof window === 'undefined') ? await buildBn128Node() : window.curve;

  var bigIntProof = unstringifyBigInts(proof);
  var bigIntInput  = unstringifyBigInts(publicSignals);
  let proofBytes = proofToBytes(bigIntProof, curve);
  let inputBytes = BigIntsToBytes(bigIntInput);
  const bcs = new BCS(getSuiMoveConfig());
  const serInputBytes = bcs.ser("vector<u8>", inputBytes).toBytes();
  const serProofBytes = bcs.ser("vector<u8>", proofBytes).toBytes();
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::join`, arguments: [txb.pure(admin), txb.pure(gameId), txb.pure(serInputBytes, "vector<u8>"), txb.pure(serProofBytes, "vector<u8>"), txb.pure(balance), txb.pure(seat)] });
}


export async function leave(packageId: string, txb: TransactionBlock, gameId: string, admin: string) : Promise<void> {
  txb.moveCall({ target: `${packageId}::${PACKAGE_NAME}::leave`, arguments: [txb.pure(admin), txb.pure(gameId)] });
}