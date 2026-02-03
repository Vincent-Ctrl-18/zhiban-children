import { useState, useEffect } from 'react';
import { 
  Table, Button, Tag, Space, message, Card, Input, 
  Modal, Checkbox, Row, Col 
} from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined,
  LoginOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { checkinApi } from '../../services/api';

function DailyCheckin() {
  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState([]);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [checkinBy, setCheckinBy] = useState('');

  useEffect(() => {
    fetchTodayStatus();
  }, []);

  const fetchTodayStatus = async () => {
    setLoading(true);
    try {
      const data = await checkinApi.getToday();
      setChildren(data);
    } catch (error) {
      message.error('获取签到状态失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckin = async (childId, checkinBy) => {
    try {
      await checkinApi.checkin({ childId, checkinBy });
      message.success('签到成功');
      fetchTodayStatus();
    } catch (error) {
      message.error(error.message || '签到失败');
    }
  };

  const handleCheckout = async (childId, checkoutBy) => {
    try {
      await checkinApi.checkout({ childId, checkoutBy });
      message.success('签退成功');
      fetchTodayStatus();
    } catch (error) {
      message.error(error.message || '签退失败');
    }
  };

  const handleMarkAbsent = async (childId) => {
    try {
      await checkinApi.markAbsent({ childId, notes: '缺勤' });
      message.success('已标记缺勤');
      fetchTodayStatus();
    } catch (error) {
      message.error('标记失败');
    }
  };

  const handleBatchCheckin = async () => {
    if (selectedIds.length === 0) {
      message.warning('请选择要签到的儿童');
      return;
    }
    if (!checkinBy) {
      message.warning('请输入送达人');
      return;
    }

    try {
      await checkinApi.batchCheckin({ childIds: selectedIds, checkinBy });
      message.success('批量签到成功');
      setBatchModalVisible(false);
      setSelectedIds([]);
      setCheckinBy('');
      fetchTodayStatus();
    } catch (error) {
      message.error('批量签到失败');
    }
  };

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '年级',
      dataIndex: 'grade',
      key: 'grade',
      width: 100,
    },
    {
      title: '签到状态',
      key: 'status',
      width: 120,
      render: (_, record) => {
        if (record.status === 'absent') {
          return <Tag color="red">缺勤</Tag>;
        }
        if (record.checkin_time) {
          return <Tag color="green" icon={<CheckCircleOutlined />}>已签到</Tag>;
        }
        return <Tag color="default">未签到</Tag>;
      },
    },
    {
      title: '签到时间',
      dataIndex: 'checkin_time',
      key: 'checkin_time',
      width: 100,
      render: (time) => time || '-',
    },
    {
      title: '送达人',
      dataIndex: 'checkin_by',
      key: 'checkin_by',
      width: 100,
      render: (name) => name || '-',
    },
    {
      title: '签退状态',
      key: 'checkout_status',
      width: 120,
      render: (_, record) => {
        if (!record.checkin_time) return '-';
        if (record.checkout_time) {
          return <Tag color="blue">已签退</Tag>;
        }
        return <Tag color="orange">未签退</Tag>;
      },
    },
    {
      title: '签退时间',
      dataIndex: 'checkout_time',
      key: 'checkout_time',
      width: 100,
      render: (time) => time || '-',
    },
    {
      title: '接走人',
      dataIndex: 'checkout_by',
      key: 'checkout_by',
      width: 100,
      render: (name) => name || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => {
        if (record.status === 'absent') {
          return <span style={{ color: '#999' }}>已标记缺勤</span>;
        }

        return (
          <Space>
            {!record.checkin_time ? (
              <>
                <Button 
                  type="primary" 
                  size="small"
                  icon={<LoginOutlined />}
                  onClick={() => {
                    Modal.confirm({
                      title: '签到确认',
                      content: (
                        <div>
                          <p>为 <strong>{record.name}</strong> 签到</p>
                          <Input 
                            placeholder="请输入送达人姓名" 
                            id="checkin-by-input"
                            style={{ marginTop: 8 }}
                          />
                        </div>
                      ),
                      onOk: () => {
                        const input = document.getElementById('checkin-by-input');
                        handleCheckin(record.id, input?.value || '');
                      },
                    });
                  }}
                >
                  签到
                </Button>
                <Button 
                  size="small" 
                  danger
                  onClick={() => handleMarkAbsent(record.id)}
                >
                  缺勤
                </Button>
              </>
            ) : !record.checkout_time ? (
              <Button 
                size="small"
                icon={<LogoutOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: '签退确认',
                    content: (
                      <div>
                        <p>为 <strong>{record.name}</strong> 签退</p>
                        <Input 
                          placeholder="请输入接走人姓名" 
                          id="checkout-by-input"
                          style={{ marginTop: 8 }}
                        />
                      </div>
                    ),
                    onOk: () => {
                      const input = document.getElementById('checkout-by-input');
                      handleCheckout(record.id, input?.value || '');
                    },
                  });
                }}
              >
                签退
              </Button>
            ) : (
              <span style={{ color: '#52c41a' }}>已完成</span>
            )}
          </Space>
        );
      },
    },
  ];

  // 统计数据
  const totalCount = children.length;
  const checkedInCount = children.filter(c => c.checkin_time).length;
  const checkedOutCount = children.filter(c => c.checkout_time).length;
  const absentCount = children.filter(c => c.status === 'absent').length;

  return (
    <div className="form-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>每日签到管理</h2>
        <Button type="primary" onClick={() => setBatchModalVisible(true)}>
          批量签到
        </Button>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#2D3436' }}>{totalCount}</div>
              <div style={{ color: '#636e72' }}>应到人数</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>{checkedInCount}</div>
              <div style={{ color: '#636e72' }}>已签到</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>{checkedOutCount}</div>
              <div style={{ color: '#636e72' }}>已签退</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#ff4d4f' }}>{absentCount}</div>
              <div style={{ color: '#636e72' }}>缺勤</div>
            </div>
          </Card>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={children}
        rowKey="id"
        loading={loading}
        pagination={false}
        locale={{ emptyText: '暂无儿童信息' }}
      />

      {/* 批量签到弹窗 */}
      <Modal
        title="批量签到"
        open={batchModalVisible}
        onOk={handleBatchCheckin}
        onCancel={() => {
          setBatchModalVisible(false);
          setSelectedIds([]);
          setCheckinBy('');
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="请输入送达人姓名"
            value={checkinBy}
            onChange={(e) => setCheckinBy(e.target.value)}
          />
        </div>
        <div style={{ maxHeight: 300, overflow: 'auto' }}>
          <Checkbox.Group
            value={selectedIds}
            onChange={setSelectedIds}
            style={{ width: '100%' }}
          >
            <Row>
              {children.filter(c => !c.checkin_time && c.status !== 'absent').map(child => (
                <Col span={12} key={child.id} style={{ marginBottom: 8 }}>
                  <Checkbox value={child.id}>{child.name} ({child.grade})</Checkbox>
                </Col>
              ))}
            </Row>
          </Checkbox.Group>
        </div>
        {children.filter(c => !c.checkin_time && c.status !== 'absent').length === 0 && (
          <div style={{ textAlign: 'center', color: '#999' }}>所有儿童已签到</div>
        )}
      </Modal>
    </div>
  );
}

export default DailyCheckin;
