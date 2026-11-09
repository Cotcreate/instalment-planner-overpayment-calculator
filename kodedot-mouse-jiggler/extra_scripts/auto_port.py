# Auto-detect the Kode Dot serial port when upload_port = auto.
Import("env")
try:
    opt = env.GetProjectOption("upload_port", None)
    if not opt or opt == "auto":
        port = env.AutodetectUploadPort()
        if port:
            env.Replace(UPLOAD_PORT=port)
except Exception as e:
    print("[auto_port] could not autodetect port:", e)
