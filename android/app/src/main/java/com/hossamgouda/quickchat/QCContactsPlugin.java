package com.hossamgouda.quickchat;

import android.Manifest;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.ContactsContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Read-only access to the phone's contact book.
 *
 * The WebView cannot reach ContactsContract, so this plugin exposes two
 * methods: requestAccess() (runtime READ_CONTACTS prompt) and list({query})
 * (name + phone numbers, server-filtered by a LIKE on name or number).
 * Contacts are read but never modified — no WRITE_CONTACTS anywhere.
 */
@CapacitorPlugin(name = "QCContacts",
        permissions = {@Permission(strings = {Manifest.permission.READ_CONTACTS}, alias = "contacts")})
public class QCContactsPlugin extends Plugin {

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (hasPermission()) {
            resolveGranted(call);
            return;
        }
        requestPermissionForAlias("contacts", call, "accessResult");
    }

    @PermissionCallback
    private void accessResult(PluginCall call) {
        resolveGranted(call);
    }

    private void resolveGranted(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getActivity().checkSelfPermission(Manifest.permission.READ_CONTACTS)
                == PackageManager.PERMISSION_GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void list(PluginCall call) {
        if (!hasPermission()) {
            call.reject("denied");
            return;
        }
        String filter = call.getString("query", "");
        JSArray out = new JSArray();
        String sel = null;
        String[] args = null;
        if (filter != null && !filter.isEmpty()) {
            sel = ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ? OR "
                    + ContactsContract.CommonDataKinds.Phone.NUMBER + " LIKE ?";
            args = new String[]{"%" + filter + "%", "%" + filter + "%"};
        }
        Cursor c = getContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{
                        ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                        ContactsContract.CommonDataKinds.Phone.NUMBER,
                        ContactsContract.CommonDataKinds.Phone.TYPE},
                sel, args,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC");
        if (c != null) {
            long lastId = -1;
            JSObject cur = null;
            JSArray phones = null;
            while (c.moveToNext()) {
                long cid = c.getLong(0);
                if (cid != lastId) {
                    cur = new JSObject();
                    cur.put("id", cid);
                    cur.put("name", c.getString(1));
                    phones = new JSArray();
                    cur.put("phones", phones);
                    out.put(cur);
                    lastId = cid;
                }
                JSObject p = new JSObject();
                p.put("number", c.getString(2));
                int type = c.getInt(3);
                CharSequence label = ContactsContract.CommonDataKinds.Phone.getTypeLabel(
                        getContext().getResources(), type, "");
                p.put("label", label == null ? "" : label.toString());
                phones.put(p);
            }
            c.close();
        }
        JSObject r = new JSObject();
        r.put("contacts", out);
        call.resolve(r);
    }

    private boolean hasPermission() {
        return getActivity().checkSelfPermission(Manifest.permission.READ_CONTACTS)
                == PackageManager.PERMISSION_GRANTED;
    }
}
