import { useState } from "react";

export default function Register() {
    const [form, setForm] = useState({
        username: "",
        email: "",
        password: "",
        password2: "",
    });

    const [response, setResponse] = useState(null);

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
              const res = await fetch("/api/auth/register/", {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json",
                  },
                  body: JSON.stringify(form),
              });

            const data = await res.json();

            console.log("STATUS:", res.status);
            console.log("DATA:", data);

            setResponse(data);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div style={{ padding: "2rem" }}>
            <h1>Register Test</h1>

            <form onSubmit={handleSubmit}>
                <div>
                    <input
                        type="text"
                        name="username"
                        placeholder="42 login"
                        value={form.username}
                        onChange={handleChange}
                    />
                </div>

                <div>
                    <input
                        type="email"
                        name="email"
                        placeholder="email"
                        value={form.email}
                        onChange={handleChange}
                    />
                </div>

                <div>
                    <input
                        type="password"
                        name="password"
                        placeholder="password"
                        value={form.password}
                        onChange={handleChange}
                    />
                </div>

                <div>
                    <input
                        type="password"
                        name="password2"
                        placeholder="Confirm password"
                        value={form.password2}
                        onChange={handleChange}
                    />
                </div>

                <button type="submit">
                    Register
                </button>
            </form>

            {response && (
                <pre>
                    {JSON.stringify(response, null, 2)}
                </pre>
            )}
        </div>
    );
}