const {
    time,
    loadFixture,
  } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const hre = require("hardhat");
const erc20Abi = require('../../abi/erc20.json');

const enco = new ethers.utils.AbiCoder();

describe("Swap:4pool",  function() {
    
    async function deploySwap() {
      let WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
      const Swap = await ethers.getContractFactory("Swap")
      let swap = await Swap.deploy(WETH)
      await swap.deployed()
      return  swap
    }
    return // test for Astar Network
    describe("4pool", async function () {
        it(`Should encode swap data and swap one USDC for USDT through a 4pool`, async function () {

          let swap =   await loadFixture(deploySwap)
          // get signer with USDC tokens
          let signer = await hre.ethers.getImpersonatedSigner('0xEc25001Feb8B1a18A47eE68Bdbc91ed2171Fae08')   
              
          let USDC =  new ethers.Contract(
              '0x6a2d262D56735DbA19Dd70682B39F6bE9a931D98',
              erc20Abi,
              signer
          )
          let USDT =  new ethers.Contract(
              '0x3795C36e7D12A8c252A20C5a7B455f7c57b60283',
              erc20Abi,
              signer
          )
          let prevUSDTBAL = Number(await USDT.balanceOf(signer.address))
          let USDC_USDT_DAI_BUSD_POOL  = '0x417E9d065ee22DFB7CC6C63C403600E27627F333'
  
          //function encodeCurveSwap(address pool,address tokenIn, int128 i, int128 j)
          let path = await swap.encode4PoolSwap(USDC_USDT_DAI_BUSD_POOL, USDC.address, 1, 2)
          
          let swapData = enco.encode(['uint'], [1]) + path.slice(2,path.length)
          // transfer 1 USDC to swap contract
          
          await USDC.transfer(swap.address, 100 * 10 ** 6)
          // swap
          await swap.connect(signer).swap(
            100 * 10 ** 6,
            swapData,
            USDT.address,
            { gasLimit: 3000000, gasPrice: 10*10 ** 9})
    
          let newUSDTBalance = Number(await USDT.balanceOf(signer.address))
          
          expect(newUSDTBalance).greaterThan(prevUSDTBAL)
            
      })
    })
    describe("4Pool lp", async function () {
      it(`Should encode swap data and swap BAI for 3CRV, redeem USDC on 3CRV `, async function () {
        let swap =   await loadFixture(deploySwap)
        // get signer with USDC tokens
        let signer = await hre.ethers.getImpersonatedSigner('0xd30391E21741C54c32987bCfcA3D880E6D261Cb0')   
            
        let USDC =  new ethers.Contract(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            erc20Abi,
            signer
        )
        let FRAX =  new ethers.Contract(
            '0x853d955aCEf822Db058eb8505911ED77F175b99e',
            erc20Abi,
            signer
        )
        let prevUSDCBAL = Number(await USDC.balanceOf(signer.address))
        let USDC_USDT_DAI_POOL  = '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7'
        let FRAX_3CRV_POOL = '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B'
        let threeCRV = '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490' //3CRV

        //function encodeCurveSwap(address pool,address tokenIn, int128 i, int128 j)
        // swap FRAX for 3CRV
        let path0 = await swap.encodeCurveSwap(FRAX_3CRV_POOL, FRAX.address, 0, 1)
        //function encodeCurve3PoolRedeem(address pool,address tokenIn,int128 i) where i = tokenOut
        let path1 = await swap.encodeCurve3PoolRedeem(USDC_USDT_DAI_POOL,threeCRV, 1 )
        let swapData = enco.encode(['uint'], [2]) + path0.slice(2,path0.length) + path1.slice(2,path1.length)
        // transfer 1 USDC to swap contract
        
        await FRAX.transfer(swap.address, ethers.utils.parseUnits('1'))
        // swap
        await swap.connect(signer).swap(
          ethers.utils.parseUnits('1'),
          swapData,
          USDC.address,
          { gasLimit: 3000000, gasPrice: 10*10 ** 9})
  
        let newUSDCBAL = Number(await FRAX.balanceOf(signer.address))
        
        expect(newUSDCBAL).greaterThan(prevUSDCBAL)

      })
    })
})