// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SwitchboardVault
/// @notice Agent operator receives payments, owner withdraws profits.
/// @dev Owner = personal wallet. Operator = agent wallet on Render.
contract SwitchboardVault is Ownable {

    IERC20 public immutable usdc;
    address public operator;

    uint256 public userFee   = 50000;   // $0.05 in USDC 6-decimals
    uint256 public minMargin = 10000;   // $0.01 minimum profit per job

    uint256 public totalJobs;
    uint256 public totalRevenue;
    uint256 public totalPaidToAgents;

    bytes public builderCode;

    struct Job {
        bytes32  jobId;
        address  user;
        uint256  charged;
        uint256  paidOut;
        uint256  margin;
        string   agentName;
        uint256  agentId;
        uint256  timestamp;
    }

    mapping(bytes32 => Job) public jobs;
    bytes32[] public jobLog;

    event JobRecorded(
        bytes32 indexed jobId,
        address indexed user,
        uint256 charged,
        uint256 paidOut,
        uint256 margin,
        string agentName,
        uint256 agentId
    );
    event OperatorUpdated(address indexed newOperator);
    event FeeUpdated(uint256 newFee);
    event Withdrawn(address indexed to, uint256 amount);

    modifier onlyOperator() {
        require(msg.sender == operator, "Not operator");
        _;
    }

    constructor(
        address _usdc,
        address _operator,
        address _owner,
        bytes memory _builderCode
    ) Ownable(_owner) {
        usdc = IERC20(_usdc);
        operator = _operator;
        builderCode = _builderCode;
    }

    function recordJob(
        bytes32 jobId,
        address user,
        uint256 charged,
        uint256 paidOut,
        string calldata agentName,
        uint256 agentId
    ) external onlyOperator {
        require(jobs[jobId].timestamp == 0, "Job exists");
        require(charged > paidOut, "No margin");
        require(charged - paidOut >= minMargin, "Below min margin");

        uint256 margin = charged - paidOut;
        jobs[jobId] = Job({
            jobId:     jobId,
            user:      user,
            charged:   charged,
            paidOut:   paidOut,
            margin:    margin,
            agentName: agentName,
            agentId:   agentId,
            timestamp: block.timestamp
        });
        jobLog.push(jobId);
        totalJobs++;
        totalRevenue      += charged;
        totalPaidToAgents += paidOut;
        emit JobRecorded(jobId, user, charged, paidOut, margin, agentName, agentId);
    }

    function withdraw() external onlyOwner {
        uint256 bal = usdc.balanceOf(address(this));
        require(bal > 0, "Nothing to withdraw");
        require(usdc.transfer(owner(), bal), "Transfer failed");
        emit Withdrawn(owner(), bal);
    }

    function setUserFee(uint256 newFee) external onlyOwner {
        userFee = newFee;
        emit FeeUpdated(newFee);
    }

    function setOperator(address newOperator) external onlyOwner {
        operator = newOperator;
        emit OperatorUpdated(newOperator);
    }

    function getJobLog() external view returns (bytes32[] memory) {
        return jobLog;
    }

    function getStats() external view returns (
        uint256 _totalJobs,
        uint256 _totalRevenue,
        uint256 _totalPaidToAgents,
        uint256 _profit,
        uint256 _balance
    ) {
        return (
            totalJobs,
            totalRevenue,
            totalPaidToAgents,
            totalRevenue - totalPaidToAgents,
            usdc.balanceOf(address(this))
        );
    }
}
