pragma solidity 0.8.9;

import {
    ILendingPool, IUniswapV2Pair, 
    IERC20, SafeERC20, BytesLib, 
    SafeMath ,IUniswapV2Router02,
    IPriceOracle} from './Libraries.sol';
import {Swap} from './Swap.sol';
//import 'hardhat/console.sol';


interface IProtocolDataProvider {
function getUserReserveData(address asset, address user)
    external
    view
    returns (
      uint256 currentATokenBalance,
      uint256 currentStableDebt,
      uint256 currentVariableDebt,
      uint256 principalStableDebt,
      uint256 scaledVariableDebt,
      uint256 stableBorrowRate,
      uint256 liquidityRate,
      uint40 stableRateLastUpdated,
      bool usageAsCollateralEnabled
    );
}

contract AaveLeverage {    
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using BytesLib for bytes;

    address admin;
    uint fee = 10000; //initially 1%
    Swap swapper;

    mapping(address=>bool) approvedLendingPools;


    constructor(
        address _admin,
        address payable _swapper,
        address [] memory _approvedLendingPools
    ) {
        admin = _admin;
        swapper = Swap(_swapper);

        for (uint i=0; i < _approvedLendingPools.length; i++) {
            approvedLendingPools[_approvedLendingPools[i]] = true;
        }

       
    }


    modifier onlyAdmin(){
        require(msg.sender == admin ,"not admin" );
        _;
    }

    modifier isApprovedLendingPool(address lendingPool) {
        require(approvedLendingPools[lendingPool], 'lending pool not approved');
        _;
    }

    event Leverage(
        address leverager, 
        address collateral,
        address debt, 
        uint collateralAmount,
        uint debtAmount
    );



    struct WindArgs {
        ILendingPool lendingPool;
        IPriceOracle priceOracle;
        address collateral;
        address debt;
        uint collateralAmount;
        uint estimatedLeveragedCollateralAmount;
        uint cRatio; //collateralization ratio scaled by 10**6
        uint collateralDecimals;
        uint debtDecimals;
        uint interestRateMode;
        uint loops;
        bytes swapData;

    }

    function wind(WindArgs memory args) public {
        IERC20 collateralToken = IERC20(args.collateral);
        IERC20 debtToken = IERC20(args.debt);
        // transfer from msg.sender
        collateralToken.safeTransferFrom(msg.sender, address(this), args.collateralAmount);

        // approve lending pool
        // we probably wouldnt have more than 10x leverage
        collateralToken.approve(address(args.lendingPool), args.collateralAmount * 100);

        uint collateralPrice = args.priceOracle.getAssetPrice(args.collateral);
        uint debtPrice =  args.priceOracle.getAssetPrice(args.debt);
       
        uint collateralBalance;
        uint debtToBorrow;
        uint leveragedCollateralBalance = 0;
       

        uint muls = collateralPrice.mul(10**args.debtDecimals).mul(10**6);
        uint divs = debtPrice.mul(10**args.collateralDecimals).mul(args.cRatio);

        for (uint i=0; i < args.loops; i++) {
            collateralBalance = collateralToken.balanceOf(address(this));
            debtToBorrow =  collateralBalance.mul(muls).div(divs);    //mul(collateralPrice).div(debtPrice).mul(10**args.debtDecimals).div(10**args.collateralDecimals).mul(10**6).div(args.cRatio);
            
            leveragedCollateralBalance += collateralBalance;
           

            args.lendingPool.deposit(    
                args.collateral,
                collateralBalance,
                msg.sender,
                0
            );

            args.lendingPool.borrow(
                args.debt,
                debtToBorrow,
                args.interestRateMode,
                0,
                msg.sender
            );

            uint debtBalance = debtToken.balanceOf(address(this));
            debtToken.transfer(address(swapper), debtBalance);
            swapper.swap(
                debtBalance,
                args.swapData,
                args.collateral
            );
        }

        collateralBalance = collateralToken.balanceOf(address(this));
        leveragedCollateralBalance += collateralBalance;

        args.lendingPool.deposit(    
            args.collateral,
            collateralBalance,
            msg.sender,
            0
        );

        require(leveragedCollateralBalance >= args.estimatedLeveragedCollateralAmount, "Leverage failed");

      
    }

    function setSwapper(address payable _swapper) external onlyAdmin  {
        swapper = Swap(_swapper);
    }

    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
    }

    function approveLendingPool(address pool) external onlyAdmin {
        approvedLendingPools[pool] = true;
    }

    function disapproveLendingPool(address pool) external onlyAdmin {
        approvedLendingPools[pool] = false;
    }
    
    function getCash(address _token) external onlyAdmin {
        IERC20 token =  IERC20(_token);
        uint bal = token.balanceOf(address(this));
        token.safeTransfer(admin, bal);
    }




}