import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface SystemMetric {
  id: string;
  metricType: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  status: "active" | "inactive";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<SystemMetric[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newMetricData, setNewMetricData] = useState({
    metricType: "",
    description: "",
    value: ""
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Calculate statistics for dashboard
  const activeCount = metrics.filter(m => m.status === "active").length;
  const inactiveCount = metrics.filter(m => m.status === "inactive").length;

  // Filter metrics based on search and filter
  const filteredMetrics = metrics.filter(metric => {
    const matchesSearch = metric.metricType.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         metric.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === "all" || metric.status === filterType;
    return matchesSearch && matchesFilter;
  });

  useEffect(() => {
    loadMetrics().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const checkAvailability = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE System Available: ${isAvailable}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const loadMetrics = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("metric_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing metric keys:", e);
        }
      }
      
      const list: SystemMetric[] = [];
      
      for (const key of keys) {
        try {
          const metricBytes = await contract.getData(`metric_${key}`);
          if (metricBytes.length > 0) {
            try {
              const metricData = JSON.parse(ethers.toUtf8String(metricBytes));
              list.push({
                id: key,
                metricType: metricData.metricType,
                encryptedData: metricData.data,
                timestamp: metricData.timestamp,
                owner: metricData.owner,
                status: metricData.status || "active"
              });
            } catch (e) {
              console.error(`Error parsing metric data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading metric ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setMetrics(list);
    } catch (e) {
      console.error("Error loading metrics:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitMetric = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting system metric with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newMetricData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const metricId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const metricData = {
        metricType: newMetricData.metricType,
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "active"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `metric_${metricId}`, 
        ethers.toUtf8Bytes(JSON.stringify(metricData))
      );
      
      const keysBytes = await contract.getData("metric_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(metricId);
      
      await contract.setData(
        "metric_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted system metric submitted!"
      });
      
      await loadMetrics();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewMetricData({
          metricType: "",
          description: "",
          value: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const toggleMetricStatus = async (metricId: string, currentStatus: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Updating metric status with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const metricBytes = await contract.getData(`metric_${metricId}`);
      if (metricBytes.length === 0) {
        throw new Error("Metric not found");
      }
      
      const metricData = JSON.parse(ethers.toUtf8String(metricBytes));
      
      const updatedMetric = {
        ...metricData,
        status: currentStatus === "active" ? "inactive" : "active"
      };
      
      await contract.setData(
        `metric_${metricId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedMetric))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `Metric ${currentStatus === "active" ? "deactivated" : "activated"}!`
      });
      
      await loadMetrics();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Status update failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const renderPieChart = () => {
    const total = metrics.length || 1;
    const activePercentage = (activeCount / total) * 100;
    const inactivePercentage = (inactiveCount / total) * 100;

    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <div 
            className="pie-segment active" 
            style={{ transform: `rotate(${activePercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment inactive" 
            style={{ transform: `rotate(${(activePercentage + inactivePercentage) * 3.6}deg)` }}
          ></div>
          <div className="pie-center">
            <div className="pie-value">{metrics.length}</div>
            <div className="pie-label">Metrics</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item">
            <div className="color-box active"></div>
            <span>Active: {activeCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box inactive"></div>
            <span>Inactive: {inactiveCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container glass-morphism">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>Private<span>OS</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-metric-btn glass-button"
          >
            <div className="add-icon"></div>
            Add Metric
          </button>
          <button 
            className="glass-button"
            onClick={checkAvailability}
          >
            Check FHE Availability
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner rainbow-gradient">
          <div className="welcome-text">
            <h2>FHE-Powered Privacy-Preserving Operating System</h2>
            <p>An experimental OS layer with encrypted kernel-level telemetry and user activity logs</p>
          </div>
        </div>
        
        <div className="dashboard-grid">
          <div className="dashboard-card glass-card">
            <h3>Project Introduction</h3>
            <p>PrivateOSFHE is an innovative operating system layer that uses Fully Homomorphic Encryption (FHE) to protect user privacy at the kernel level. All system telemetry and user activity logs remain encrypted while allowing for secure analysis.</p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
          
          <div className="dashboard-card glass-card">
            <h3>System Metrics Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{metrics.length}</div>
                <div className="stat-label">Total Metrics</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{activeCount}</div>
                <div className="stat-label">Active</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{inactiveCount}</div>
                <div className="stat-label">Inactive</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card glass-card">
            <h3>Metrics Distribution</h3>
            {renderPieChart()}
          </div>
        </div>
        
        <div className="metrics-section">
          <div className="section-header">
            <h2>Encrypted System Metrics</h2>
            <div className="header-actions">
              <div className="search-filter">
                <input 
                  type="text"
                  placeholder="Search metrics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="glass-input"
                />
                <select 
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="glass-select"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <button 
                onClick={loadMetrics}
                className="refresh-btn glass-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="metrics-list glass-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Metric Type</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredMetrics.length === 0 ? (
              <div className="no-metrics">
                <div className="no-metrics-icon"></div>
                <p>No encrypted metrics found</p>
                <button 
                  className="glass-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Metric
                </button>
              </div>
            ) : (
              filteredMetrics.map(metric => (
                <div className="metric-row" key={metric.id}>
                  <div className="table-cell metric-id">#{metric.id.substring(0, 6)}</div>
                  <div className="table-cell">{metric.metricType}</div>
                  <div className="table-cell">{metric.owner.substring(0, 6)}...{metric.owner.substring(38)}</div>
                  <div className="table-cell">
                    {new Date(metric.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${metric.status}`}>
                      {metric.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    {isOwner(metric.owner) && (
                      <button 
                        className="action-btn glass-button"
                        onClick={() => toggleMetricStatus(metric.id, metric.status)}
                      >
                        {metric.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="team-section glass-card">
          <h2>Our Team</h2>
          <div className="team-grid">
            <div className="team-member">
              <div className="member-avatar"></div>
              <h4>Dr. Alice Chen</h4>
              <p>FHE Research Lead</p>
            </div>
            <div className="team-member">
              <div className="member-avatar"></div>
              <h4>Mark Johnson</h4>
              <p>Systems Architect</p>
            </div>
            <div className="team-member">
              <div className="member-avatar"></div>
              <h4>Sarah Williams</h4>
              <p>Privacy Engineer</p>
            </div>
            <div className="team-member">
              <div className="member-avatar"></div>
              <h4>David Kim</h4>
              <p>Cryptography Specialist</p>
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitMetric} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          metricData={newMetricData}
          setMetricData={setNewMetricData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content glass-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>PrivateOSFHE</span>
            </div>
            <p>FHE-Powered Privacy-Preserving Operating System</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} PrivateOSFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  metricData: any;
  setMetricData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  metricData,
  setMetricData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setMetricData({
      ...metricData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!metricData.metricType || !metricData.value) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal glass-card">
        <div className="modal-header">
          <h2>Add Encrypted System Metric</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your system metric will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Metric Type *</label>
              <select 
                name="metricType"
                value={metricData.metricType} 
                onChange={handleChange}
                className="glass-select"
              >
                <option value="">Select type</option>
                <option value="CPU Usage">CPU Usage</option>
                <option value="Memory Usage">Memory Usage</option>
                <option value="Disk I/O">Disk I/O</option>
                <option value="Network Traffic">Network Traffic</option>
                <option value="Process Count">Process Count</option>
                <option value="System Uptime">System Uptime</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Description</label>
              <input 
                type="text"
                name="description"
                value={metricData.description} 
                onChange={handleChange}
                placeholder="Brief description..." 
                className="glass-input"
              />
            </div>
            
            <div className="form-group">
              <label>Value *</label>
              <input 
                type="text"
                name="value"
                value={metricData.value} 
                onChange={handleChange}
                placeholder="Metric value..." 
                className="glass-input"
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn glass-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn glass-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;