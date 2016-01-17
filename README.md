# homebridge-globalcache-itach

This homebridge plugin adds support for Global Cache iTach devices.  Example configuration is below.  Note that only the contact closure is currently supported.  IR support will be added in a few days. 

```
"platforms": [
    {
        "platform": "GlobalCacheItach",
        "name": "Global Cache Itach",
        "devices": [
            {
                "name": "Gate",
                "host": "192.168.0.XXX",
                "outputs": [
                    {
                        "name": "Gate",
                        "toggleMode": true
                    }, {
                        "disable": true
                    }, {
                        "disable": true
                    }
                ]
            }
        ]
    }
]

```