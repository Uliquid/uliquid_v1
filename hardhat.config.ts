require('@typechain/hardhat')
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */

const {config} = require('dotenv')
config()
let deployer= process.env.DEPLOYER
module.exports = {
  solidity: "0.8.9",
  networks: {
    'test': {
      url: 'http://127.0.0.1:4444/',
      timeout: 900000
    },
   
    ethereum: {
      url: 'https://eth-mainnet.g.alchemy.com/', 
    },
    polygon: {
      url: 'https://polygon-rpc.com', 
      accounts: [deployer],
    },
    bsc: {
      url: 'https://bsc-dataseed3.binance.org/',
      accounts: [deployer],
    },
    arbitrum: {
      url: 'https://arb1.arbitrum.io/rpc',
      accounts: [deployer],
    },
    moon_river: {
      url: 'https://rpc.moonriver.moonbeam.network',
      accounts: [deployer],
    },
     celo: {
      url: 'https://forno.celo.org',
      accounts: [deployer],
    },
    harmony: {
      url: 'https://api.harmony.one/',
      accounts: [deployer],   
    },
    fuse: {
      url: 'https://rpc.fuse.io/',
      accounts: [deployer],
    },
    kcc: {
      url: 'https://rpc-mainnet.kcc.network',
      accounts: [deployer],  
    },
    
    telos: {
      url: 'https://mainnet.telos.net/evm',
      accounts: [deployer],
    },
    kardia: {
      url:  'https://rpc.kardiachain.io/',
      accounts: [deployer],
    },

    astar: {
      url:  'https://rpc.astar.network:8545',
      accounts: [deployer],
    },
    velas: {
      url:  'https://evmexplorer.velas.com/rpc',
      accounts: [deployer],
    },
    cronos: {
      url:  'http://localhost:8595',
      accounts: [deployer],
    },
    hsc: {
      url:  'https://http-mainnet.hoosmartchain.com/',
      accounts: [deployer],
    },
    milkomeda: {
      url:  'https://rpc-mainnet-cardano-evm.c1.milkomeda.com' ,
      accounts: [deployer],
    },
    avalanche: {
      url:  'https://api.avax.network/ext/bc/C/rpc',
      accounts: [deployer],
    },
    optimism: {
      url:  'https://mainnet.optimism.io/',
      accounts: [deployer],
    }

  },
};
