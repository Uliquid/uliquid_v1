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
describe("Swap:Curve", function() {
    async function deploySwap() {
      let WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
      const Swap = await ethers.getContractFactory("Swap")
      let swap = await Swap.deploy(WETH)
      await swap.deployed()
      return  swap
    }

    describe("Curve 3pool", async function () {
      it(`Should encode swap data and swap one USDC for USDT through a Curve 3pool`, async function () {
        let swap =   await loadFixture(deploySwap)
        // get signer with USDC tokens
        let signer = await hre.ethers.getImpersonatedSigner('0x55FE002aefF02F77364de339a1292923A15844B8')   
            
        let USDC =  new ethers.Contract(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            erc20Abi,
            signer
        )
        let USDT =  new ethers.Contract(
            '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            erc20Abi,
            signer
        )
        let prevUSDTBAL = Number(await USDT.balanceOf(signer.address))
        let USDC_USDT_DAI_POOL  = '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7'

        //function encodeCurveSwap(address pool,address tokenIn, int128 i, int128 j)
        let path = await swap.encodeCurveSwap(USDC_USDT_DAI_POOL, USDC.address, 1, 2)
        
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

    describe("Curve 3pool AToken", async function () {
      it(`Should encode swap data and deposit one USDC for aUSDC, swap one aUSDC for aUSDT through a Curve 3pool AToken and withdraw USDT from aUSDT`, async function () {
        let swap =   await loadFixture(deploySwap)
        // get signer with USDC tokens
        let signer = await hre.ethers.getImpersonatedSigner('0x55FE002aefF02F77364de339a1292923A15844B8')   
            
        let USDC =  new ethers.Contract(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            erc20Abi,
            signer
        )
        let USDT =  new ethers.Contract(
            '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            erc20Abi,
            signer
        )
        let prevUSDTBAL = Number(await USDT.balanceOf(signer.address))
        let aUSDC_aUSDT_aDAI_POOL  = '0xDeBF20617708857ebe4F679508E7b7863a8A8EeE'
        let lendingPool = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9'
        let aUSDC = '0xBcca60bB61934080951369a648Fb03DF4F96263C'
        let aUSDT = '0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811'

        //function encodeATokens(address pool,address tokenIn,uint code)
        // deposit USDC
        let path0 = await swap.encodeATokens(lendingPool, USDC.address, 0)
        //swap aUSDC for aUSDT
        //function encodeCurveSwap(address pool,address tokenIn, int128 i, int128 j)
        let path1 = await swap.encodeCurveSwap(aUSDC_aUSDT_aDAI_POOL, aUSDC, 1, 2)
          
        //function encodeATokens(address pool,address tokenIn,uint code)
        // withdraw USDT
        let path2 = await swap.encodeATokens(lendingPool, aUSDT, 1)


        let swapData = enco.encode(['uint'], [3]) + path0.slice(2,path0.length) + path1.slice(2,path1.length) + path2.slice(2,path2.length) 
        // transfer 1 USDC to swap contract
        
        await USDC.transfer(swap.address, 100 * 10 ** 6)
        // swap
        await swap.connect(signer).swap(
          100 * 10 ** 6,
          swapData,
          USDT.address
        ,{ gasLimit: 3000000, gasPrice: 10*10 ** 9})

        let newUSDTBalance = Number(await USDT.balanceOf(signer.address))
        
        expect(newUSDTBalance).greaterThan(prevUSDTBAL)

    })
    })
    
    describe("Curve Lp Pool", async function () {
      it(`Should encode swap data and swap FRAX for 3CRV, redeem USDC on 3CRV `, async function () {
        let swap =   await loadFixture(deploySwap)
        // get signer with USDC tokens
        let signer = await hre.ethers.getImpersonatedSigner('0xC83a1BB26dC153c009d5BAAd9855Fe90cF5A1529')   
            
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

    describe("Curve ETH Pool Version2", async function () {
      it(`Should encode swap data and swap one ETH for CRV through a Curve ETH pool type 2, then swap CRV back for WETH`, async function () {
        let swap =   await loadFixture(deploySwap)
        // get signer with USDC tokens
        let signer = await hre.ethers.getSigner()
        let CRV =  new ethers.Contract(
            '0xD533a949740bb3306d119CC777fa900bA034cd52',
            erc20Abi,
            signer
        )
        let prevCRVBAL = Number(await CRV.balanceOf(signer.address))
        let ETH_CRV_POOL = '0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511'
        let WETH =  new ethers.Contract(
          '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          erc20Abi,
          signer
      )
        //function encodeCurveSwap(address pool,address tokenIn, int128 i, int128 j)
        let path = await swap.encodeCurveSwapETH2( ETH_CRV_POOL, WETH.address, 0, 1)
        let swapData = enco.encode(['uint'], [1]) + path.slice(2,path.length)
        // transfer 1 ETH to swap contract
        await signer.sendTransaction({
          to: swap.address,
          data: '0x',
          value: ethers.utils.parseUnits('1'),
        })
        

        // swap
        await swap.connect(signer).swap(
          ethers.utils.parseUnits('1'),
          swapData,
          CRV.address,
          { gasLimit: 3000000, gasPrice: 10*10 ** 9})
  
        let newCRVBalance = Number(await CRV.balanceOf(signer.address))
        
        expect(newCRVBalance).greaterThan(prevCRVBAL)


        // CRV for WETH
        let prevWETHBAL = Number(await WETH.balanceOf(signer.address))
        await CRV.transfer(
          swap.address,
          ethers.BigNumber.from(BigInt(newCRVBalance)),
        )
        path = await swap.encodeCurveSwapETH2( ETH_CRV_POOL, CRV.address, 1, 0)
        swapData = enco.encode(['uint'], [1]) + path.slice(2,path.length)

        await swap.connect(signer).swap(
          ethers.BigNumber.from(BigInt(newCRVBalance)),
          swapData,
          WETH.address,
          { gasLimit: 3000000, gasPrice: 10*10 ** 9})

        let newWETHBalance = Number(await WETH.balanceOf(signer.address))
      
        expect(newWETHBalance).greaterThan(prevWETHBAL)
  

    })
    })
})