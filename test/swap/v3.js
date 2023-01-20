const {
    time,
    loadFixture,
  } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const hre = require("hardhat");
const erc20Abi = require('../../abi/erc20.json');

const enco = new ethers.utils.AbiCoder();

// PASSED TESTS ON BLOCK 15812600
describe("Swap",  function() {
  
    async function deploySwap() {
      let WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
      const Swap = await ethers.getContractFactory("Swap")
      let swap = await Swap.deploy(WETH)
      await swap.deployed()
      return  swap
    }

    describe("Uniswap V3", async function () {
      it(`Should encode swap data and swap one token for another through a Uniswap V3 Pool`, async function () {
        let swap =   await loadFixture(deploySwap)
        // get signer with USDC tokens
        let signer = await hre.ethers.getImpersonatedSigner('0x55FE002aefF02F77364de339a1292923A15844B8')   
       
        let USDC =  new ethers.Contract(
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          erc20Abi,
          signer
        )
        let WETH =  new ethers.Contract(
            '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            erc20Abi,
            signer
        )
        
        let prevWETHBAL = Number(await WETH.balanceOf(signer.address))


        let USDC_WETH_POOL  = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640' // fee 0.05%
        let router = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
        //function encodeV2Swap(address pool,address tokenIn,bool isToken0)
        let path = await swap.encodeV3Swap(router, USDC.address, WETH.address, parseInt(0.05/100 * 1*10**6))
        let swapData = enco.encode(['uint'], [1]) + path.slice(2,path.length)

        // transfer 1 USDC to swap contract
        await USDC.transfer(swap.address, 100 * 10 ** 6)
        // swap
        await swap.connect(signer).swap(
          100 * 10 ** 6,
          swapData,
          WETH.address
        )
  
        let newWETHBalance = Number(await WETH.balanceOf(signer.address))
        
        expect(newWETHBalance).greaterThan(prevWETHBAL)

    })
    })
   
})