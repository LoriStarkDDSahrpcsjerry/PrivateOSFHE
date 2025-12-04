// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivateOSFHE is SepoliaConfig {
    struct SystemMetric {
        euint32 encryptedCpuUsage;
        euint32 encryptedMemoryUsage;
        euint32 encryptedDiskActivity;
        euint32 encryptedNetworkTraffic;
        uint256 timestamp;
    }

    struct CrashReport {
        euint32 encryptedErrorCode;
        euint32 encryptedMemoryDumpHash;
        euint32 encryptedProcessId;
        bool isAnalyzed;
    }

    struct PerformanceAnalysis {
        euint32 encryptedAvgCpu;
        euint32 encryptedPeakMemory;
        euint32 encryptedAnomalyScore;
    }

    uint256 public metricCount;
    uint256 public crashCount;
    uint256 public analysisCount;
    mapping(uint256 => SystemMetric) public systemMetrics;
    mapping(uint256 => CrashReport) public crashReports;
    mapping(uint256 => PerformanceAnalysis) public performanceAnalyses;
    mapping(uint256 => uint256) private requestToMetricId;
    mapping(uint256 => uint256) private requestToCrashId;
    
    event MetricCollected(uint256 indexed metricId);
    event CrashReported(uint256 indexed crashId);
    event AnalysisCompleted(uint256 indexed analysisId);
    event AnomalyDetected(uint256 indexed metricId);

    function submitSystemMetric(
        euint32 cpuUsage,
        euint32 memoryUsage,
        euint32 diskActivity,
        euint32 networkTraffic
    ) public {
        metricCount++;
        systemMetrics[metricCount] = SystemMetric({
            encryptedCpuUsage: cpuUsage,
            encryptedMemoryUsage: memoryUsage,
            encryptedDiskActivity: diskActivity,
            encryptedNetworkTraffic: networkTraffic,
            timestamp: block.timestamp
        });
        emit MetricCollected(metricCount);
    }

    function reportCrash(
        euint32 errorCode,
        euint32 memoryDumpHash,
        euint32 processId
    ) public {
        crashCount++;
        crashReports[crashCount] = CrashReport({
            encryptedErrorCode: errorCode,
            encryptedMemoryDumpHash: memoryDumpHash,
            encryptedProcessId: processId,
            isAnalyzed: false
        });
        emit CrashReported(crashCount);
    }

    function analyzePerformance(uint256[] memory metricIds) public {
        require(metricIds.length > 0, "No metrics provided");
        
        bytes32[] memory ciphertexts = new bytes32[](metricIds.length * 4);
        for (uint256 i = 0; i < metricIds.length; i++) {
            ciphertexts[i*4] = FHE.toBytes32(systemMetrics[metricIds[i]].encryptedCpuUsage);
            ciphertexts[i*4+1] = FHE.toBytes32(systemMetrics[metricIds[i]].encryptedMemoryUsage);
            ciphertexts[i*4+2] = FHE.toBytes32(systemMetrics[metricIds[i]].encryptedDiskActivity);
            ciphertexts[i*4+3] = FHE.toBytes32(systemMetrics[metricIds[i]].encryptedNetworkTraffic);
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.calculatePerformance.selector);
        requestToMetricId[reqId] = metricIds[0];
    }

    function calculatePerformance(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 metricId = requestToMetricId[requestId];
        require(metricId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32[] memory metrics = abi.decode(cleartexts, (uint32[]));
        uint32 totalCpu = 0;
        uint32 peakMemory = 0;
        uint32 anomalyScore = 0;
        
        for (uint256 i = 0; i < metrics.length / 4; i++) {
            totalCpu += metrics[i*4];
            if (metrics[i*4+1] > peakMemory) {
                peakMemory = metrics[i*4+1];
            }
            // Simplified anomaly detection
            if (metrics[i*4] > 90 || metrics[i*4+1] > 85) {
                anomalyScore += 1;
            }
        }
        
        uint32 avgCpu = totalCpu / uint32(metrics.length / 4);
        
        analysisCount++;
        performanceAnalyses[analysisCount] = PerformanceAnalysis({
            encryptedAvgCpu: FHE.asEuint32(avgCpu),
            encryptedPeakMemory: FHE.asEuint32(peakMemory),
            encryptedAnomalyScore: FHE.asEuint32(anomalyScore)
        });

        if (anomalyScore > 0) {
            emit AnomalyDetected(metricId);
        }
        
        emit AnalysisCompleted(analysisCount);
    }

    function analyzeCrash(uint256 crashId) public {
        require(crashId <= crashCount, "Invalid crash report");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(crashReports[crashId].encryptedErrorCode);
        ciphertexts[1] = FHE.toBytes32(crashReports[crashId].encryptedMemoryDumpHash);
        ciphertexts[2] = FHE.toBytes32(crashReports[crashId].encryptedProcessId);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.processCrash.selector);
        requestToCrashId[reqId] = crashId;
    }

    function processCrash(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 crashId = requestToCrashId[requestId];
        require(crashId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32[] memory crashData = abi.decode(cleartexts, (uint32[]));
        uint32 errorCode = crashData[0];
        uint32 memoryHash = crashData[1];
        uint32 processId = crashData[2];
        
        // Process crash data (would use actual analysis in production)
        crashReports[crashId].isAnalyzed = true;
    }

    function requestMetricDecryption(uint256 metricId) public {
        require(metricId <= metricCount, "Invalid metric");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(systemMetrics[metricId].encryptedCpuUsage);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptMetric.selector);
        requestToMetricId[reqId] = metricId;
    }

    function decryptMetric(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 metricId = requestToMetricId[requestId];
        require(metricId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 cpuUsage = abi.decode(cleartexts, (uint32));
        // Process decrypted metric
    }

    function getCrashAnalysisStatus(uint256 crashId) public view returns (bool) {
        return crashReports[crashId].isAnalyzed;
    }

    function getMetricCount() public view returns (uint256) {
        return metricCount;
    }

    function getCrashCount() public view returns (uint256) {
        return crashCount;
    }
}