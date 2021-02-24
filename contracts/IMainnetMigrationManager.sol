pragma solidity 0.6.6;

interface IMainnetMigrationManager {
    function newToken() external returns (address);
    function newMediator() external returns (address);
}