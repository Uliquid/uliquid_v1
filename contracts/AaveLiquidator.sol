pragma solidity 0.8.9;

import {
    ILendingPool, IUniswapV2Pair, 
    IERC20, SafeERC20, BytesLib, 
    SafeMath ,IUniswapV2Router02,
    IPriceOracle} from './Libraries.sol';
import {Swap} from './Swap.sol';

contract AaveLiquidator {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using BytesLib for bytes;

    address admin;
    address treasury;
    uint fee = 10000; //initially 1%
    Swap swapper;

    mapping(address=>bool) approvedLendingPools;


    constructor(
        address _admin,
        address _treasury,
        address payable _swapper,
        address [] memory _approvedLendingPools
    ) {
        admin = _admin;
        treasury = _treasury;
        swapper = Swap(_swapper);

        for (uint i=0; i < _approvedLendingPools.length; i++) {
            approvedLendingPools[_approvedLendingPools[i]] = true;
        }

    }


    modifier onlyAdmin(){
        require(msg.sender == admin ,"not admin" );
        _;
    }

    modifier isApprovedLendingPool() {
        require(approvedLendingPools[msg.sender], 'lending pool not approved');
        _;
    }

    event Liquidation(
        address liquidator, 
        address debt, 
        address collateral,
        uint debtAmount,
        uint collateralAmount
    );

    struct liquidateArgs {
        ILendingPool lendingPool;
        IPriceOracle priceOracle;
        address debt;
        address collateral;
        address aTokenCollateral;
        uint debtAmount;
        uint stableDebtAmount;
        uint variableDebtAmount;
        uint collateralAmount;
        uint debtDecimals;
        uint collateralDecimals;
        uint feePlusSlippage;
        uint minSwapOut;
        bytes swapData;
    }

    function liquidate(
        liquidateArgs memory args 
    ) external { 
        //require that the value of collateral is at least feePlusSlippage% greater than the debt
        uint collateralValue = args.priceOracle.getAssetPrice(args.collateral).mul(args.collateralAmount).div(10**args.collateralDecimals);
        uint debtValue = args.priceOracle.getAssetPrice(args.debt).mul(args.debtAmount).div(10**args.debtDecimals);
        require(collateralValue >= (debtValue.add(debtValue.mul(args.feePlusSlippage).div(1000000))), 'Collateral value too low');
        
        //should be exactly 100% + feePlusSlippage
        args.collateralAmount = (debtValue.add(debtValue.mul(args.feePlusSlippage).div(1000000))).mul(args.collateralAmount).div(collateralValue);
        // require msg.sender has approved us to spend their collateral
        require(IERC20(args.aTokenCollateral).allowance(msg.sender, address(this)) >= args.collateralAmount, 'No Allowance');
    
        uint [] memory modes = new uint[](1);
        address [] memory assets = new address[](1);
        uint [] memory amounts = new uint[](1);

        modes[0] = 0;
        assets[0] = args.debt;
        amounts[0] = args.debtAmount;

        bytes memory data = abi.encode(
                msg.sender, args.debt, 
                args.collateral, args.aTokenCollateral, 
                args.debtAmount, args.stableDebtAmount, args.variableDebtAmount, 
                args.collateralAmount, args.minSwapOut
        );
        
        data = data.concat(args.swapData);
        uint prevDebtBal = IERC20(args.debt).balanceOf(address(this));
        args.lendingPool.flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            address(this),
            data,
            uint16(0)
        );

        IERC20 debtToken = IERC20(args.debt);
        IERC20 collateralToken = IERC20(args.collateral);
        uint newDebtBal = debtToken.balanceOf(address(this));
        // we only keep 1% of collateral
        if (args.debt == args.collateral) {
            // if debt == collateral
            // transfer newDebtBal - (prevDebtBal + fee%) to sender
            uint transferAmount = newDebtBal.sub(prevDebtBal.add(prevDebtBal.mul(fee).div(1000000)));
            debtToken.safeTransfer(msg.sender, transferAmount);
        } else {
            // transfer whatever balance of debt left over to the sender
            debtToken.safeTransfer(msg.sender, newDebtBal.sub(prevDebtBal));
        }
        collateralToken.safeTransfer(treasury, collateralToken.balanceOf(address(this)));
        emit Liquidation(msg.sender, args.debt, args.collateral, args.debtAmount, args.collateralAmount);
    }

    function executeOperation(
        address[] memory assets,
        uint256[] memory amounts,
        uint256[] memory premiums,
        address sender,
        bytes memory data
    ) external isApprovedLendingPool returns (bool){
        
        (
            address user, address debt,
            address collateral, address aTokenCollateral,
            uint debtAmount, uint stableDebtAmount, uint variableDebtAmount, 
            uint collateralAmount, uint minSwapOut
        ) = abi.decode(data.slice(0,288), (address, address, address, address, uint, uint, uint, uint, uint));

        require(tx.origin == user, 'Liquidation can only be performed by user');

        uint approvalAmount = debtAmount.mul(2).add(premiums[0]);
        
        IERC20(debt).approve(address(msg.sender), approvalAmount);
      
        if (stableDebtAmount != 0 ) {
            ILendingPool(msg.sender).repay(
                debt,
                stableDebtAmount,
                1,
                user
            );
        } 

        if (variableDebtAmount != 0) {
            ILendingPool(msg.sender).repay(
                debt,
                variableDebtAmount,
                2,
                user
            );
        }   
       
        IERC20(aTokenCollateral).transferFrom(user, address(this), collateralAmount);
        ILendingPool(msg.sender).withdraw(collateral, collateralAmount, address(this));
        
        if (data.length  > 288) {
            data = data.slice(288, data.length-288);
            collateralAmount = collateralAmount.sub(collateralAmount.mul(fee).div(1000000)); // collateral amount minus our 1% fee
            IERC20(collateral).safeTransfer(address(swapper), collateralAmount);
           
            try swapper.swap(
                collateralAmount,
                data,
                debt
            ) {
                require(IERC20(debt).balanceOf(address(this)) >= minSwapOut, 'Slippage higher than expected');
            } catch {
                revert('swap failed');
            }
        }
       
        return true;
    }

    function setSwapper(address payable _swapper) external onlyAdmin  {
        swapper = Swap(_swapper);
    }

    function setFee(uint _fee) external onlyAdmin {
        fee = _fee;
    }

    function setTreasury(address _treasury) external onlyAdmin {
        treasury = _treasury;
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

    function getCashSend(address _token, address to) external onlyAdmin {
        IERC20 token =  IERC20(_token);
        uint bal = token.balanceOf(address(this));
        token.safeTransfer(to, bal);
    }




}