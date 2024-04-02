const hikConfig = {
  // 综合安防管理平台提供的appkey
  appkey: '',
  // 综合安防管理平台提供的secret
  secret: '',
  // 综合安防管理平台IP地址，必填
  ip: '',
  // 初始播放模式：0-预览，1-回放
  playMode: 0,
  // 综合安防管理平台端口，若启用HTTPS协议，默认443
  port: 443,
  // 抓图存储路径
  snapDir: 'D:\\SnapDir',
  // 紧急录像或录像剪辑存储路径
  videoDir: 'D:\\VideoDir',
  // 1x1布局
  layout: '1x1',
  // 是否启用HTTPS协议与综合安防管理平台交互，这里总是填1
  enableHTTPS: 1,
  // 加密字段，默认加密领域为secret
  encryptedFields: 'secret',
  // 是否显示工具栏，0-不显示，非0-显示
  showToolbar: 1,
  // 是否显示智能信息（如配置移动侦测后画面上的线框），0-不显示，非0-显示
  showSmart: 0,
  // 自定义工具条按钮
  buttonIDs: '0,16,256,257,258,259,260,512,513,514,515,516,517,768,769',
}

class Ocx {
  constructor(options) {
    this.oWebControl = null
    this.pubKey = '';
    if (!document || typeof window === 'undefined') {
      throw new Error('document不存在')
    }
    this.el = options.el || 'playWnd'
    const $el = document.getElementById(this.el)
    if (!$el) {
      throw new Error(`未找到指定容器：${this.el}，请检查是否设置正确的元素ID`)
    }
    const _width = $el.offsetWidth
    const _height = $el.offsetHeight

    this.lock = options.width !== undefined && options.height !== undefined

    this.width = options.width || _width
    this.height = options.height || _height

    this.options = options

    this.success = options.success || function () { }
    this.error = options.error || function () { }

    this.iLastCoverLeft = 0
    this.iLastCoverTop = 0
    this.iLastCoverRight = 0
    this.iLastCoverBottom = 0

    this.initPlugin();

    window.onunload = () => {
      this.close()
    }

  }

  initPlugin() {
    let that = this;
    this.oWebControl = new WebControl({
      szPluginContainer: that.el,
      // 对应 LocalServiceConfig.xml 中的ServicePortStart值
      iServicePortStart: that.options.iServicePortStart || 15900,
      // 对应 LocalServiceConfig.xml 中的ServicePortEnd值
      iServicePortEnd: that.options.iServicePortEnd || 15909,
      szClassId: that.options.szClassId || '23BF3B0A-2C56-4D97-9C03-0CB103AA8F11',
      cbConnectSuccess() {
        that.oWebControl.JS_StartService("window", {
          dllPath: that.options.dllPath || "./VideoPluginConnect.dll"
        }).then(() => {
          if (that.options.callback) {
            that.callback(that.options.callback)
          }
          that.createWnd();
        })
      }
    })
  }

  createWnd() {
    let that = this;
    let { el, width, height } = that;
    that.oWebControl.JS_CreateWnd(that.el, width, height).then(function () {
      that.getPubKey(() => {
        Object.assign(hikConfig, {
          playMode: that.playMode,
          secret: that.setEncrypt(hikConfig.secret),
        });
        that.request({
          funcName: 'init',
          argument: {
            ...hikConfig,
          }
        }).then((oData) => {
          // 初始化后resize一次，规避firefox下首次显示窗口后插件窗口未与DIV窗口重合问题
          that.oWebControl.JS_Resize(width, height);
          that.success();
          that.setWndCover()
          window.addEventListener('resize', that.resize.bind(that))
        })
      })
    })
  }

  /**
   * 获取公钥
   */
  getPubKey(callback) {
    this.request({
      funcName: "getRSAPubKey",
      argument: {
        keyLength: 1024
      }
    }).then((oData) => {
      if (oData.responseMsg.data) {
        this.pubKey = oData.responseMsg.data
        callback();
      }
    });
  }

  request(params) {
    return new Promise(resolve => {
      this.oWebControl.JS_RequestInterface({
        funcName: params.funcName,
        argument: JSON.stringify(params.argument)
      }).then(oData => {
        resolve(oData)
      })
    })
  }

  //RSA加密
  setEncrypt(value) {
    let encrypt = new JSEncrypt();
    encrypt.setPublicKey(this.pubKey);
    return encrypt.encrypt(value);
  }

  callback(cb) {
    const that = this
    that.oWebControl.JS_SetWindowControlCallback({
      cbIntegrationCallBack(data) {
        cb(data, that)
      }
    })
  }

  cut(left = 0, top = 0, width = this.width, height = this.height) {
    this.oWebControl.JS_CuttingPartWindow(left, top, width, height)
  }

  repair(left = 0, top = 0, width = this.width, height = this.height) {
    this.oWebControl.JS_RepairPartWindow(left, top, width, height)
  }

  wakeUp(path) {
    WebControl.JS_WakeUp(path)
  }

  resize() {
    if (this.oWebControl) {
      let width = this.width;
      let height = this.height;
      const $el = document.getElementById(this.el)
      width = $el.offsetWidth
      height = $el.offsetHeight
      this.oWebControl.JS_Resize(width, height)
    }
  }

  setWndCover() {
    const { width, height } = this

    const iWidth = window.innerWidth
    const iHeight = window.innerHeight
    const oDivRect = document.getElementById(this.el).getBoundingClientRect()

    let iCoverLeft = (oDivRect.left < 0) ? Math.abs(oDivRect.left) : 0
    let iCoverTop = (oDivRect.top < 0) ? Math.abs(oDivRect.top) : 0
    let iCoverRight = (oDivRect.right - iWidth > 0) ? Math.round(oDivRect.right - iWidth) : 0
    let iCoverBottom = (oDivRect.bottom - iHeight > 0) ? Math.round(oDivRect.bottom - iHeight) : 0

    iCoverLeft = (iCoverLeft > width) ? width : iCoverLeft
    iCoverTop = (iCoverTop > height) ? height : iCoverTop
    iCoverRight = (iCoverRight > width) ? width : iCoverRight
    iCoverBottom = (iCoverBottom > height) ? height : iCoverBottom

    if (this.iLastCoverLeft !== iCoverLeft) {
      this.iLastCoverLeft = iCoverLeft
    }
    if (this.iLastCoverTop !== iCoverTop) {
      if (iCoverTop === 0) {
        this.oWebControl.JS_RepairPartWindow(0, 0, width, height)
        this.oWebControl.JS_CuttingPartWindow(width - iCoverRight, 0, iCoverRight, height)
      }
      this.iLastCoverTop = iCoverTop
      if (oDivRect.right - iWidth > 0) {
        this.oWebControl.JS_RepairPartWindow(0, 0, width, height)
        this.oWebControl.JS_CuttingPartWindow(width - iCoverRight, 0, iCoverRight, height)
        this.oWebControl.JS_CuttingPartWindow(0, 0, width, iCoverTop)
      } else {
        this.oWebControl.JS_RepairPartWindow(0, 0, width, height)
        this.oWebControl.JS_CuttingPartWindow(0, 0, width, iCoverTop)
      }
    }
    if (this.iLastCoverRight !== iCoverRight) {
      if (iCoverRight === 0) {
        this.oWebControl.JS_RepairPartWindow(0, 0, width, height)
        this.oWebControl.JS_CuttingPartWindow(0, 0, width, iCoverTop)
      }

      this.iLastCoverRight = iCoverRight

      if (oDivRect.top < 0) {
        this.oWebControl.JS_RepairPartWindow(0, 0, width, height)
        this.oWebControl.JS_CuttingPartWindow(0, 0, width, iCoverTop)
        this.oWebControl.JS_CuttingPartWindow(width - iCoverRight, 0, iCoverRight, height)
      } else {
        this.oWebControl.JS_RepairPartWindow(0, 0, width, height)
        this.oWebControl.JS_CuttingPartWindow(width - iCoverRight, 0, iCoverRight, height)
      }

      if (oDivRect.bottom - iHeight > 0) {
        this.oWebControl.JS_CuttingPartWindow(0, height - iCoverBottom, width, iCoverBottom + 20)
      }
    }
    if (this.iLastCoverBottom !== iCoverBottom) {
      this.iLastCoverBottom = iCoverBottom
      this.oWebControl.JS_RepairPartWindow(0, 0, width, height)
      this.oWebControl.JS_CuttingPartWindow(0, 0, width, iCoverTop)
      this.oWebControl.JS_CuttingPartWindow(width - iCoverRight, 0, iCoverRight, height)
      this.oWebControl.JS_CuttingPartWindow(0, height - iCoverBottom, width, iCoverBottom + 20)
    }
  }

  /**
   * 预览视频
   */
  previewVideo(hikIndex) {
    // 获取输入的监控点编号值，必填
    let cameraIndexCode = hikIndex;
    // 主子码流标识：0-主码流，1-子码流
    let streamMode = 0;
    // 传输协议：0-UDP，1-TCP
    let transMode = 1;
    //是否启用GPU硬解，0-不启用，1-启用
    let gpuMode = 0;
    // 播放窗口序号（在2x2以上布局下可指定播放窗口）
    let wndId = -1;

    cameraIndexCode = cameraIndexCode.replace(/(^\s*)/g, '');
    cameraIndexCode = cameraIndexCode.replace(/(\s*$)/g, '');

    this.request({
      funcName: 'startPreview',
      argument: {
        cameraIndexCode, //监控点编号
        streamMode, //主子码流标识
        transMode, //传输协议
        gpuMode, //是否开启GPU硬解
        wndId, //可指定播放窗口
      },
    });
  }

  close(success, error) {
    if (this.oWebControl != null) {
      const that = this
      const bIE = (!!window.ActiveXObject || 'ActiveXObject' in window) // 是否为IE浏览器
      that.request({ funcName: 'destroyWnd' })
      window.removeEventListener('resize', that.resize.bind(this))
      window.removeEventListener('scroll', that.resize.bind(this))

      if (bIE) {
        if (that.oWebControl != null) {
          that.oWebControl.JS_Disconnect().then(function () {
            success && success()
          }, function () {
            error && error()
          })
        }
      } else {
        if (that.oWebControl != null) {
          that.oWebControl.JS_DestroyWnd().then(function () { }, function () {
            error && error()
          })
          that.oWebControl.JS_StopService('window').then(function () {
            that.oWebControl.JS_Disconnect().then(function () {
              success && success()
            }, function () {
              error && error()
            })
          })
        }
      }
    }
  }

}