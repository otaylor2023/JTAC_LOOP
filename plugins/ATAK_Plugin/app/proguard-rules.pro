# Keep ATAK plugin entry points so the runtime can find them by reflection.
-keep class com.jtacsim.plugin.JtacPluginLifecycle { *; }
-keep class com.jtacsim.plugin.JtacMapComponent { *; }
-keep class com.jtacsim.plugin.JtacDropDownReceiver { *; }
-keep class com.jtacsim.plugin.JtacTool { *; }

# Keep the engine — it's accessed by name from the View binder.
-keep class com.jtacsim.plugin.engine.** { *; }
