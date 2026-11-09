# Name the output binary after `app_name` in platformio.ini (e.g. MouseJiggler.bin).
Import("env")
cfg = env.GetProjectConfig()
name = cfg.get("env:" + env["PIOENV"], "app_name", None) or "KodeApp"
env.Replace(PROGNAME=name)
