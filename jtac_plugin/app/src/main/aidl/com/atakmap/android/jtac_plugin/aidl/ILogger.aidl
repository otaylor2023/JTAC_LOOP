
package com.atakmap.android.jtac_plugin.aidl;

// Declare any non-default types here with import statements

interface ILogger {

    void e(String tag, String msg, String exception);

    void d(String tag, String msg, String exception);

}

